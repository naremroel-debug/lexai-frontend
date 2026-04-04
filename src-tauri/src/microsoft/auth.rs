use crate::error::AppError;
use crate::microsoft::types::{MSTokenPair, MSTokenResponse};
use chrono::Utc;
use log::{error, info};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use url::Url;

// ---------------------------------------------------------------------------
// REPLACE this with your Azure AD / Microsoft Entra app (client) ID.
// Register at https://portal.azure.com → App registrations
// Platform: "Mobile and desktop applications", redirect http://localhost
// ---------------------------------------------------------------------------
const MS_CLIENT_ID: &str = "8009d788-5c4d-4fca-bd83-685ad5b88cac";

const MS_AUTH_URL: &str =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL: &str =
    "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const MS_SCOPES: &str =
    "Mail.ReadWrite Mail.Send Calendars.ReadWrite Tasks.ReadWrite offline_access User.Read";

const KEYRING_SERVICE: &str = "pe.lexai.desktop.microsoft";
const KEYRING_USER: &str = "tokens";

// Global in-memory token cache (mirrors gmail/auth.rs pattern).
static TOKEN_CACHE: std::sync::OnceLock<Mutex<Option<MSTokenPair>>> =
    std::sync::OnceLock::new();

fn token_cache() -> &'static Mutex<Option<MSTokenPair>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Start the Microsoft OAuth 2.0 authorization code flow.
///
/// Binds a random local port, builds the consent URL, and spawns a
/// background thread that waits for the redirect callback.  Returns the
/// consent URL and the port.
pub fn start_auth_flow() -> Result<(String, u16), AppError> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::NetworkError(format!("Failed to bind local port: {}", e)))?;

    let port = listener
        .local_addr()
        .map_err(|e| AppError::NetworkError(e.to_string()))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{}", port);

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&response_mode=query&prompt=consent",
        MS_AUTH_URL,
        urlencoding(&MS_CLIENT_ID),
        urlencoding(&redirect_uri),
        urlencoding(MS_SCOPES),
    );

    // Spawn a thread that accepts exactly one connection (the OAuth callback).
    std::thread::spawn(move || {
        if let Err(e) = handle_oauth_callback(listener, &redirect_uri) {
            error!("Microsoft OAuth callback handler error: {}", e);
        }
    });

    Ok((auth_url, port))
}

/// Load tokens from the OS keychain.
pub fn load_tokens() -> Result<MSTokenPair, AppError> {
    // Try in-memory cache first.
    if let Ok(guard) = token_cache().lock() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| AppError::KeychainError(e.to_string()))?;

    let json = entry
        .get_password()
        .map_err(|_| AppError::AuthRequired)?;

    let tokens: MSTokenPair =
        serde_json::from_str(&json).map_err(|e| AppError::ParseError(e.to_string()))?;

    // Populate cache.
    if let Ok(mut guard) = token_cache().lock() {
        *guard = Some(tokens.clone());
    }

    Ok(tokens)
}

/// Persist tokens to the OS keychain and update the in-memory cache.
pub fn store_tokens(tokens: &MSTokenPair) -> Result<(), AppError> {
    let json =
        serde_json::to_string(tokens).map_err(|e| AppError::ParseError(e.to_string()))?;

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| AppError::KeychainError(e.to_string()))?;

    entry
        .set_password(&json)
        .map_err(|e| AppError::KeychainError(e.to_string()))?;

    if let Ok(mut guard) = token_cache().lock() {
        *guard = Some(tokens.clone());
    }

    Ok(())
}

/// Delete tokens from the OS keychain and clear the cache.
pub fn delete_tokens() -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| AppError::KeychainError(e.to_string()))?;

    // Ignore errors if entry doesn't exist.
    let _ = entry.delete_password();

    if let Ok(mut guard) = token_cache().lock() {
        *guard = None;
    }

    Ok(())
}

/// Check whether we have a non-expired access token.
pub fn has_valid_tokens() -> bool {
    match load_tokens() {
        Ok(tokens) => Utc::now().timestamp() < tokens.expires_at,
        Err(_) => false,
    }
}

/// Return a valid access token, refreshing if necessary.
pub async fn get_access_token() -> Result<String, AppError> {
    let tokens = load_tokens()?;

    // If the token is still valid (with 60s buffer), return it directly.
    if Utc::now().timestamp() < tokens.expires_at - 60 {
        return Ok(tokens.access_token);
    }

    // Refresh the token.
    info!("Microsoft access token expired, refreshing...");
    refresh_access_token(&tokens).await
}

/// Refresh the access token using the refresh token.
///
/// Microsoft may return a new refresh_token — always store it.
async fn refresh_access_token(tokens: &MSTokenPair) -> Result<String, AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .post(MS_TOKEN_URL)
        .form(&[
            ("client_id", MS_CLIENT_ID),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
            ("scope", MS_SCOPES),
        ])
        .send()
        .await?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        delete_tokens()?;
        return Err(AppError::TokenExpired);
    }
    if status == reqwest::StatusCode::BAD_REQUEST {
        // Microsoft returns 400 for invalid/expired refresh tokens.
        let body = resp.text().await.unwrap_or_default();
        if body.contains("invalid_grant") {
            delete_tokens()?;
            return Err(AppError::TokenExpired);
        }
        return Err(AppError::ApiError(status.as_u16(), body));
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::ApiError(status.as_u16(), body));
    }

    let token_resp: MSTokenResponse = resp.json().await?;

    let new_tokens = MSTokenPair {
        access_token: token_resp.access_token,
        refresh_token: token_resp
            .refresh_token
            .unwrap_or_else(|| tokens.refresh_token.clone()),
        expires_at: Utc::now().timestamp() + token_resp.expires_in,
        email: tokens.email.clone(),
    };

    store_tokens(&new_tokens)?;
    Ok(new_tokens.access_token)
}

/// Fetch Microsoft tokens from Vercel server and store in OS keychain.
/// Called after OAuth completes through the Vercel flow.
pub fn sync_tokens_from_server(access_token: &str, refresh_token: &str, expires_at: i64) -> Result<(), AppError> {
    let pair = MSTokenPair {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        expires_at,
        email: None,
    };
    store_tokens(&pair)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/// Minimal percent-encoding for URL query parameters.
fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

/// Handle the OAuth redirect: read the authorization code from the HTTP
/// request, exchange it for tokens, and persist them.
fn handle_oauth_callback(listener: TcpListener, redirect_uri: &str) -> Result<(), AppError> {
    listener
        .set_nonblocking(false)
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|e| AppError::NetworkError(format!("Failed to accept connection: {}", e)))?;

    let request_line = {
        let mut reader = BufReader::new(&stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| AppError::NetworkError(e.to_string()))?;
        line
    };

    // Extract the code from: GET /?code=AUTH_CODE&... HTTP/1.1
    let code = extract_code_from_request(&request_line)?;

    // Send a friendly HTML response back to the browser.
    let html = r#"<html><body style="font-family:system-ui;text-align:center;padding:60px">
        <h2>LexAI conectado a Microsoft 365</h2>
        <p>Puedes cerrar esta ventana y volver a la aplicacion.</p>
        </body></html>"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(response.as_bytes());

    // Exchange the code for tokens (blocking — we're on a dedicated thread).
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    rt.block_on(exchange_code(&code, redirect_uri))?;

    info!("Microsoft OAuth flow completed successfully");
    Ok(())
}

fn extract_code_from_request(request_line: &str) -> Result<String, AppError> {
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| AppError::ParseError("Invalid HTTP request".into()))?;

    let dummy_base = format!("http://localhost{}", path);
    let url = Url::parse(&dummy_base).map_err(|e| AppError::ParseError(e.to_string()))?;

    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .ok_or_else(|| {
            let err_msg = url
                .query_pairs()
                .find(|(k, _)| k == "error")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_else(|| "No authorization code in callback".into());
            AppError::ParseError(err_msg)
        })
}

/// Exchange the authorization code for access + refresh tokens.
///
/// Microsoft native/desktop apps (public clients) do NOT send client_secret.
async fn exchange_code(code: &str, redirect_uri: &str) -> Result<(), AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .post(MS_TOKEN_URL)
        .form(&[
            ("client_id", MS_CLIENT_ID),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("scope", MS_SCOPES),
        ])
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::ApiError(status.as_u16(), body));
    }

    let token_resp: MSTokenResponse = resp.json().await?;

    let tokens = MSTokenPair {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token.unwrap_or_default(),
        expires_at: Utc::now().timestamp() + token_resp.expires_in,
        email: None,
    };

    store_tokens(&tokens)?;
    Ok(())
}
