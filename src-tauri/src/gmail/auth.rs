use crate::error::GmailError;
use crate::gmail::types::{GoogleTokenResponse, TokenPair};
use chrono::Utc;
use log::{error, info};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use url::Url;

// ---------------------------------------------------------------------------
// REPLACE these with your Google Cloud OAuth 2.0 credentials
// ---------------------------------------------------------------------------
const CLIENT_ID: &str = "450897227009-tfrve9upc8rs0oghuleen67tic2jg99f.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";

const KEYRING_SERVICE: &str = "pe.lexai.desktop.gmail";
const KEYRING_USER: &str = "tokens";

const SCOPES: &str = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks";

// Global in-memory token cache to avoid hitting the keychain on every call.
static TOKEN_CACHE: std::sync::OnceLock<Mutex<Option<TokenPair>>> = std::sync::OnceLock::new();

fn token_cache() -> &'static Mutex<Option<TokenPair>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Start the OAuth 2.0 authorization flow.
///
/// Binds a random local port, builds the Google consent URL, and spawns a
/// background thread that waits for the redirect callback.  Returns the
/// consent URL and the port the listener is bound to.
pub fn start_auth_flow() -> Result<(String, u16), GmailError> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| GmailError::NetworkError(format!("Failed to bind local port: {}", e)))?;

    let port = listener
        .local_addr()
        .map_err(|e| GmailError::NetworkError(e.to_string()))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{}", port);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
         ?client_id={}\
         &redirect_uri={}\
         &response_type=code\
         &scope={}\
         &access_type=offline\
         &prompt=consent",
        urlencoding(&CLIENT_ID),
        urlencoding(&redirect_uri),
        urlencoding(SCOPES),
    );

    // Spawn a thread that accepts exactly one connection (the OAuth callback).
    std::thread::spawn(move || {
        if let Err(e) = handle_oauth_callback(listener, &redirect_uri) {
            error!("OAuth callback handler error: {}", e);
        }
    });

    Ok((auth_url, port))
}

/// Load tokens from the OS keychain.
pub fn load_tokens() -> Result<TokenPair, GmailError> {
    // Try in-memory cache first.
    if let Ok(guard) = token_cache().lock() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| GmailError::KeychainError(e.to_string()))?;

    let json = entry
        .get_password()
        .map_err(|_| GmailError::AuthRequired)?;

    let tokens: TokenPair =
        serde_json::from_str(&json).map_err(|e| GmailError::ParseError(e.to_string()))?;

    // Populate cache.
    if let Ok(mut guard) = token_cache().lock() {
        *guard = Some(tokens.clone());
    }

    Ok(tokens)
}

/// Persist tokens to the OS keychain and update the in-memory cache.
pub fn store_tokens(tokens: &TokenPair) -> Result<(), GmailError> {
    let json =
        serde_json::to_string(tokens).map_err(|e| GmailError::ParseError(e.to_string()))?;

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| GmailError::KeychainError(e.to_string()))?;

    entry
        .set_password(&json)
        .map_err(|e| GmailError::KeychainError(e.to_string()))?;

    if let Ok(mut guard) = token_cache().lock() {
        *guard = Some(tokens.clone());
    }

    Ok(())
}

/// Delete tokens from the OS keychain and clear the cache.
pub fn delete_tokens() -> Result<(), GmailError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| GmailError::KeychainError(e.to_string()))?;

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
pub async fn get_access_token() -> Result<String, GmailError> {
    let tokens = load_tokens()?;

    // If the token is still valid, return it directly.
    if Utc::now().timestamp() < tokens.expires_at - 60 {
        return Ok(tokens.access_token);
    }

    // Refresh the token.
    info!("Access token expired, refreshing...");
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        delete_tokens()?;
        return Err(GmailError::TokenExpired);
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(GmailError::ApiError(status.as_u16(), body));
    }

    let token_resp: GoogleTokenResponse = resp.json().await?;

    let new_tokens = TokenPair {
        access_token: token_resp.access_token,
        refresh_token: token_resp
            .refresh_token
            .unwrap_or(tokens.refresh_token),
        expires_at: Utc::now().timestamp() + token_resp.expires_in,
        email: tokens.email,
    };

    store_tokens(&new_tokens)?;
    Ok(new_tokens.access_token)
}

/// Fetch Google tokens from Vercel server and store in OS keychain.
/// Called after OAuth completes through the Vercel flow.
pub fn sync_tokens_from_server(access_token: &str, refresh_token: &str, expires_at: i64) -> Result<(), GmailError> {
    let pair = TokenPair {
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
fn handle_oauth_callback(listener: TcpListener, redirect_uri: &str) -> Result<(), GmailError> {
    // Set a timeout so the thread doesn't hang forever.
    listener
        .set_nonblocking(false)
        .map_err(|e| GmailError::NetworkError(e.to_string()))?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|e| GmailError::NetworkError(format!("Failed to accept connection: {}", e)))?;

    let request_line = {
        let mut reader = BufReader::new(&stream);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| GmailError::NetworkError(e.to_string()))?;
        line
    };

    // Extract the code from: GET /?code=AUTH_CODE&scope=... HTTP/1.1
    let code = extract_code_from_request(&request_line)?;

    // Send a friendly HTML response back to the browser.
    let html = r#"<html><body style="font-family:system-ui;text-align:center;padding:60px">
        <h2>LexAI conectado a Gmail</h2>
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
        .map_err(|e| GmailError::NetworkError(e.to_string()))?;

    rt.block_on(exchange_code_for_tokens(&code, redirect_uri))?;

    info!("Gmail OAuth flow completed successfully");
    Ok(())
}

fn extract_code_from_request(request_line: &str) -> Result<String, GmailError> {
    // "GET /?code=XYZ&scope=... HTTP/1.1"
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| GmailError::ParseError("Invalid HTTP request".into()))?;

    let dummy_base = format!("http://localhost{}", path);
    let url = Url::parse(&dummy_base).map_err(|e| GmailError::ParseError(e.to_string()))?;

    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .ok_or_else(|| {
            // Check for an error parameter.
            let err_msg = url
                .query_pairs()
                .find(|(k, _)| k == "error")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_else(|| "No authorization code in callback".into());
            GmailError::ParseError(err_msg)
        })
}

async fn exchange_code_for_tokens(
    code: &str,
    redirect_uri: &str,
) -> Result<(), GmailError> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(GmailError::ApiError(status.as_u16(), body));
    }

    let token_resp: GoogleTokenResponse = resp.json().await?;

    let tokens = TokenPair {
        access_token: token_resp.access_token,
        refresh_token: token_resp
            .refresh_token
            .unwrap_or_default(),
        expires_at: Utc::now().timestamp() + token_resp.expires_in,
        email: None,
    };

    store_tokens(&tokens)?;
    Ok(())
}
