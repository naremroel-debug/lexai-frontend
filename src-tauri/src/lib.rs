// =============================================================================
// LexAI Desktop — Tauri Backend
// =============================================================================
//
// SECURITY ARCHITECTURE
// ---------------------
// This app follows the principle of least privilege:
//
// 1. Content Security Policy (CSP) — configured in tauri.conf.json
//    - script-src 'self'          : Only bundled scripts, no inline/eval
//    - style-src 'self' 'unsafe-inline' + Google Fonts : Tailwind/shadcn need
//      inline styles; fonts loaded from Google CDN
//    - connect-src (allowlisted):
//        * https://*.supabase.co              — Auth, database, storage
//        * https://www.googleapis.com         — Google API general
//        * https://oauth2.googleapis.com      — Google OAuth token exchange
//        * https://gmail.googleapis.com       — Gmail integration
//        * https://accounts.google.com        — Google sign-in
//        * https://generativelanguage.googleapis.com — Gemini AI
//        * https://api.anthropic.com          — Claude AI
//        * https://lexai-omega.vercel.app     — Legacy Vercel backend
//        * https://tasks.googleapis.com       — Google Tasks API
//    - img-src 'self' data: https: asset:     — Local + remote images + data URIs
//    - font-src 'self' + Google Fonts CDN
//    - frame-src 'none'                       — No iframes allowed
//    - object-src 'none'                      — No plugins (Flash, Java, etc.)
//    - base-uri 'self'                        — Prevent base tag hijacking
//    - form-action 'self'                     — Forms can only submit locally
//
// 2. IPC Capabilities — configured in capabilities/default.json
//    - Window management (open, close, minimize, maximize, resize)
//    - Path resolution (for Tauri asset protocol)
//    - Event system (listen/emit for frontend<->backend communication)
//    - App metadata (version)
//    - HTTP plugin with domain scope (same allowlist as CSP connect-src)
//    - DENIED: filesystem, shell, process, clipboard, dialog, updater
//
// 3. HTTP Scope — enforced by tauri-plugin-http
//    - Only HTTPS requests to the allowlisted domains above
//    - All plain HTTP requests are denied
//    - Wildcard paths allowed only within approved domains
//
// When adding new external services, update THREE places:
//   1. tauri.conf.json  -> security.csp.connect-src
//   2. capabilities/default.json -> http permission allow list
//   3. This comment block
// =============================================================================

mod error;
mod gmail;
mod calendar;
mod gtasks;
mod microsoft;
mod suggestions;

use calendar::types::{CalendarEvent, CalendarEventInput};
use gmail::types::{EmailData, SendEmailRequest};
use gtasks::types::{GTask, GTaskInput};
use microsoft::todo::{MSTodoInput, MSTodoTask};
use microsoft::types::OutlookSendRequest;
use suggestions::engine::{Suggestion, SuggestionContext};
use log::{error, info, warn};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

// ---------------------------------------------------------------------------
// App state — persisted across commands within one session
// ---------------------------------------------------------------------------

struct SyncState {
    /// The last Gmail history ID, used for incremental sync.
    last_history_id: Option<String>,
    /// The last Google Calendar sync token for incremental sync.
    calendar_sync_token: Option<String>,
    /// The Google Tasks list ID for the "LexAI" list.
    gtasks_list_id: Option<String>,
    /// The Outlook delta link for incremental mail sync.
    outlook_delta_link: Option<String>,
    /// The Microsoft Calendar delta link for incremental event sync.
    ms_calendar_delta_link: Option<String>,
    /// The Microsoft To Do list ID for the "LexAI" list.
    mstodo_list_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Gmail Tauri commands
// ---------------------------------------------------------------------------

/// Start the Gmail OAuth flow: opens the consent screen in the system browser.
#[tauri::command]
async fn gmail_auth_start() -> Result<String, String> {
    let (url, _port) = gmail::auth::start_auth_flow().map_err(|e| e.to_string())?;

    // Open in system browser.
    open::that(&url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(url)
}

/// No-op callback — the actual token exchange happens inside the TCP listener
/// spawned by `start_auth_flow`.  This command exists so the frontend can
/// register it if needed.
#[tauri::command]
async fn gmail_auth_callback() -> Result<(), String> {
    Ok(())
}

/// Check whether the user is authenticated with Gmail.
#[tauri::command]
async fn gmail_auth_status() -> Result<bool, String> {
    Ok(gmail::auth::has_valid_tokens())
}

/// Disconnect Gmail: delete stored tokens.
#[tauri::command]
async fn gmail_auth_disconnect() -> Result<(), String> {
    gmail::auth::delete_tokens().map_err(|e| e.to_string())
}

/// Sync emails from Gmail (incremental if we have a history ID).
#[tauri::command]
async fn gmail_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<EmailData>, String> {
    let last_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.last_history_id.clone()
    };

    let (emails, new_history_id) = gmail::client::sync_emails(last_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    // Update stored history ID.
    if let Some(ref hid) = new_history_id {
        if let Ok(mut guard) = state.lock() {
            guard.last_history_id = Some(hid.clone());
        }
    }

    Ok(emails)
}

/// Send an email via Gmail.
#[tauri::command]
async fn gmail_send(request: SendEmailRequest) -> Result<(), String> {
    gmail::client::send_email(request)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Calendar Tauri commands
// ---------------------------------------------------------------------------

/// Sync calendar events (incremental if we have a sync token).
#[tauri::command]
async fn calendar_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<CalendarEvent>, String> {
    let sync_token = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.calendar_sync_token.clone()
    };

    let (events, new_token) = calendar::client::sync_events(sync_token.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref token) = new_token {
        if let Ok(mut guard) = state.lock() {
            guard.calendar_sync_token = Some(token.clone());
        }
    }

    Ok(events)
}

/// Create a new calendar event.
#[tauri::command]
async fn calendar_create_event(input: CalendarEventInput) -> Result<CalendarEvent, String> {
    calendar::client::create_event(&input)
        .await
        .map_err(|e| e.to_string())
}

/// Update an existing calendar event.
#[tauri::command]
async fn calendar_update_event(
    gcal_event_id: String,
    input: CalendarEventInput,
) -> Result<CalendarEvent, String> {
    calendar::client::update_event(&gcal_event_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a calendar event.
#[tauri::command]
async fn calendar_delete_event(gcal_event_id: String) -> Result<(), String> {
    calendar::client::delete_event(&gcal_event_id)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Google Tasks Tauri commands
// ---------------------------------------------------------------------------

/// Sync tasks from the LexAI task list.
#[tauri::command]
async fn gtasks_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<GTask>, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.gtasks_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = gtasks::client::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.gtasks_list_id = Some(id.clone());
            }
            id
        }
    };

    gtasks::client::sync_tasks(&list_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new task in the LexAI task list.
#[tauri::command]
async fn gtasks_create(
    state: tauri::State<'_, Mutex<SyncState>>,
    input: GTaskInput,
) -> Result<GTask, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.gtasks_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = gtasks::client::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.gtasks_list_id = Some(id.clone());
            }
            id
        }
    };

    gtasks::client::create_task(&list_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Update an existing task.
#[tauri::command]
async fn gtasks_update(
    state: tauri::State<'_, Mutex<SyncState>>,
    task_id: String,
    input: GTaskInput,
) -> Result<GTask, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.gtasks_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = gtasks::client::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.gtasks_list_id = Some(id.clone());
            }
            id
        }
    };

    gtasks::client::update_task(&list_id, &task_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a task as completed.
#[tauri::command]
async fn gtasks_complete(
    state: tauri::State<'_, Mutex<SyncState>>,
    task_id: String,
) -> Result<(), String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.gtasks_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = gtasks::client::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.gtasks_list_id = Some(id.clone());
            }
            id
        }
    };

    gtasks::client::complete_task(&list_id, &task_id)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Microsoft 365 Tauri commands
// ---------------------------------------------------------------------------

/// Start the Microsoft OAuth flow: opens the consent screen in the system browser.
#[tauri::command]
async fn ms_auth_start() -> Result<String, String> {
    let (url, _port) = microsoft::auth::start_auth_flow().map_err(|e| e.to_string())?;
    open::that(&url).map_err(|e| format!("Failed to open browser: {}", e))?;
    Ok(url)
}

/// Check whether the user is authenticated with Microsoft.
#[tauri::command]
async fn ms_auth_status() -> Result<bool, String> {
    Ok(microsoft::auth::has_valid_tokens())
}

/// Disconnect Microsoft: delete stored tokens.
#[tauri::command]
async fn ms_auth_disconnect() -> Result<(), String> {
    microsoft::auth::delete_tokens().map_err(|e| e.to_string())
}

/// Sync emails from Outlook (incremental if we have a delta link).
#[tauri::command]
async fn outlook_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<EmailData>, String> {
    let delta = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.outlook_delta_link.clone()
    };

    let (emails, new_delta) = microsoft::outlook::sync_messages(delta.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref dl) = new_delta {
        if let Ok(mut guard) = state.lock() {
            guard.outlook_delta_link = Some(dl.clone());
        }
    }

    Ok(emails)
}

/// Send an email via Outlook.
#[tauri::command]
async fn outlook_send(request: OutlookSendRequest) -> Result<(), String> {
    microsoft::outlook::send_message(request)
        .await
        .map_err(|e| e.to_string())
}

/// Sync events from Microsoft Calendar (incremental if we have a delta link).
#[tauri::command]
async fn ms_calendar_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<CalendarEvent>, String> {
    let delta = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.ms_calendar_delta_link.clone()
    };

    let (events, new_delta) = microsoft::calendar::sync_events(delta.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref dl) = new_delta {
        if let Ok(mut guard) = state.lock() {
            guard.ms_calendar_delta_link = Some(dl.clone());
        }
    }

    Ok(events)
}

/// Create a new event on the Microsoft Calendar.
#[tauri::command]
async fn ms_calendar_create_event(input: CalendarEventInput) -> Result<CalendarEvent, String> {
    microsoft::calendar::create_event(&input)
        .await
        .map_err(|e| e.to_string())
}

/// Update an existing event on the Microsoft Calendar.
#[tauri::command]
async fn ms_calendar_update_event(
    event_id: String,
    input: CalendarEventInput,
) -> Result<CalendarEvent, String> {
    microsoft::calendar::update_event(&event_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete an event from the Microsoft Calendar.
#[tauri::command]
async fn ms_calendar_delete_event(event_id: String) -> Result<(), String> {
    microsoft::calendar::delete_event(&event_id)
        .await
        .map_err(|e| e.to_string())
}

/// Sync tasks from the LexAI To Do list (Microsoft).
#[tauri::command]
async fn mstodo_sync(
    state: tauri::State<'_, Mutex<SyncState>>,
) -> Result<Vec<MSTodoTask>, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.mstodo_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = microsoft::todo::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.mstodo_list_id = Some(id.clone());
            }
            id
        }
    };

    microsoft::todo::sync_tasks(&list_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new task in the LexAI To Do list (Microsoft).
#[tauri::command]
async fn mstodo_create(
    state: tauri::State<'_, Mutex<SyncState>>,
    input: MSTodoInput,
) -> Result<MSTodoTask, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.mstodo_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = microsoft::todo::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.mstodo_list_id = Some(id.clone());
            }
            id
        }
    };

    microsoft::todo::create_task(&list_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Update an existing task in the LexAI To Do list (Microsoft).
#[tauri::command]
async fn mstodo_update(
    state: tauri::State<'_, Mutex<SyncState>>,
    task_id: String,
    input: MSTodoInput,
) -> Result<MSTodoTask, String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.mstodo_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = microsoft::todo::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.mstodo_list_id = Some(id.clone());
            }
            id
        }
    };

    microsoft::todo::update_task(&list_id, &task_id, &input)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a task as completed in the LexAI To Do list (Microsoft).
#[tauri::command]
async fn mstodo_complete(
    state: tauri::State<'_, Mutex<SyncState>>,
    task_id: String,
) -> Result<(), String> {
    let list_id = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.mstodo_list_id.clone()
    };

    let list_id = match list_id {
        Some(id) => id,
        None => {
            let id = microsoft::todo::ensure_lexai_list()
                .await
                .map_err(|e| e.to_string())?;
            if let Ok(mut guard) = state.lock() {
                guard.mstodo_list_id = Some(id.clone());
            }
            id
        }
    };

    microsoft::todo::complete_task(&list_id, &task_id)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Token sync commands (called by frontend after Vercel OAuth completes)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn sync_google_tokens(access_token: String, refresh_token: String, expires_at: i64) -> Result<(), String> {
    gmail::auth::sync_tokens_from_server(&access_token, &refresh_token, expires_at)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_microsoft_tokens(access_token: String, refresh_token: String, expires_at: i64) -> Result<(), String> {
    microsoft::auth::sync_tokens_from_server(&access_token, &refresh_token, expires_at)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// AI Suggestions Tauri command
// ---------------------------------------------------------------------------

/// Generate AI-powered suggestions based on user context.
///
/// Accepts a Gemini API key. Builds an empty context for now (frontend will
/// pass richer context in future sprints). Falls back to rule-based suggestions
/// if Gemini fails.
#[tauri::command]
async fn generate_suggestions(gemini_api_key: String) -> Result<Vec<Suggestion>, String> {
    let ctx = SuggestionContext {
        active_cases: vec![],
        upcoming_deadlines: vec![],
        unread_emails: vec![],
        calendar_events: vec![],
        pending_tasks: vec![],
    };

    let prompt = suggestions::engine::build_prompt(&ctx);

    match suggestions::engine::call_gemini(&prompt, &gemini_api_key).await {
        Ok(suggestions) => Ok(suggestions),
        Err(e) => {
            warn!("Gemini call failed, using fallback suggestions: {}", e);
            Ok(suggestions::engine::fallback_suggestions(&ctx))
        }
    }
}

// ---------------------------------------------------------------------------
// Background sync timer
// ---------------------------------------------------------------------------

fn start_background_sync(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Wait 30 seconds after app start before the first sync.
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        loop {
            // Only attempt sync if tokens exist.
            if gmail::auth::has_valid_tokens() {
                // ---- Gmail sync ----
                info!("Background Gmail sync starting...");

                let last_id = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.last_history_id.clone()
                };

                match gmail::client::sync_emails(last_id.as_deref()).await {
                    Ok((emails, new_history_id)) => {
                        // Update history ID.
                        if let Some(ref hid) = new_history_id {
                            let state = app_handle.state::<Mutex<SyncState>>();
                            if let Ok(mut guard) = state.lock() {
                                guard.last_history_id = Some(hid.clone());
                            };
                        }

                        if !emails.is_empty() {
                            info!("Background sync fetched {} emails", emails.len());
                            let _ = app_handle.emit("gmail:emails-fetched", &emails);
                        }
                    }
                    Err(crate::error::AppError::AuthRequired)
                    | Err(crate::error::AppError::TokenExpired) => {
                        warn!("Background sync: auth required");
                        let _ = app_handle.emit("gmail:auth-required", ());
                    }
                    Err(e) => {
                        error!("Background Gmail sync error: {}", e);
                        let _ = app_handle.emit("gmail:sync-error", e.to_string());
                    }
                }

                // ---- Calendar sync ----
                info!("Background Calendar sync starting...");

                let cal_token = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.calendar_sync_token.clone()
                };

                match calendar::client::sync_events(cal_token.as_deref()).await {
                    Ok((events, new_token)) => {
                        if let Some(ref token) = new_token {
                            let state = app_handle.state::<Mutex<SyncState>>();
                            if let Ok(mut guard) = state.lock() {
                                guard.calendar_sync_token = Some(token.clone());
                            };
                        }

                        if !events.is_empty() {
                            info!("Background sync fetched {} calendar events", events.len());
                            let _ = app_handle.emit("calendar:events-synced", &events);
                        }
                    }
                    Err(e) => {
                        error!("Background Calendar sync error: {}", e);
                    }
                }

                // ---- Google Tasks sync ----
                info!("Background Tasks sync starting...");

                let list_id = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.gtasks_list_id.clone()
                };

                // Only sync tasks if we already know the list ID (don't create
                // the list from background — let the user trigger that first).
                if let Some(ref lid) = list_id {
                    match gtasks::client::sync_tasks(lid).await {
                        Ok(tasks) => {
                            if !tasks.is_empty() {
                                info!("Background sync fetched {} tasks", tasks.len());
                                let _ = app_handle.emit("gtasks:tasks-synced", &tasks);
                            }
                        }
                        Err(e) => {
                            error!("Background Tasks sync error: {}", e);
                        }
                    }
                }
            }

            // ================================================================
            // Microsoft 365 background sync
            // ================================================================
            if microsoft::auth::has_valid_tokens() {
                // ---- Outlook sync ----
                info!("Background Outlook sync starting...");

                let outlook_delta = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.outlook_delta_link.clone()
                };

                match microsoft::outlook::sync_messages(outlook_delta.as_deref()).await {
                    Ok((emails, new_delta)) => {
                        if let Some(ref dl) = new_delta {
                            let state = app_handle.state::<Mutex<SyncState>>();
                            if let Ok(mut guard) = state.lock() {
                                guard.outlook_delta_link = Some(dl.clone());
                            };
                        }

                        if !emails.is_empty() {
                            info!("Background sync fetched {} Outlook emails", emails.len());
                            let _ = app_handle.emit("outlook:emails-fetched", &emails);
                        }
                    }
                    Err(crate::error::AppError::AuthRequired)
                    | Err(crate::error::AppError::TokenExpired) => {
                        warn!("Background Outlook sync: auth required");
                        let _ = app_handle.emit("ms:auth-required", ());
                    }
                    Err(e) => {
                        error!("Background Outlook sync error: {}", e);
                    }
                }

                // ---- MS Calendar sync ----
                info!("Background MS Calendar sync starting...");

                let ms_cal_delta = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.ms_calendar_delta_link.clone()
                };

                match microsoft::calendar::sync_events(ms_cal_delta.as_deref()).await {
                    Ok((events, new_delta)) => {
                        if let Some(ref dl) = new_delta {
                            let state = app_handle.state::<Mutex<SyncState>>();
                            if let Ok(mut guard) = state.lock() {
                                guard.ms_calendar_delta_link = Some(dl.clone());
                            };
                        }

                        if !events.is_empty() {
                            info!(
                                "Background sync fetched {} MS Calendar events",
                                events.len()
                            );
                            let _ = app_handle.emit("ms-calendar:events-synced", &events);
                        }
                    }
                    Err(e) => {
                        error!("Background MS Calendar sync error: {}", e);
                    }
                }

                // ---- MS To Do sync ----
                info!("Background MS To Do sync starting...");

                let mstodo_lid = {
                    let state = app_handle.state::<Mutex<SyncState>>();
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    guard.mstodo_list_id.clone()
                };

                // Only sync tasks if we already know the list ID.
                if let Some(ref lid) = mstodo_lid {
                    match microsoft::todo::sync_tasks(lid).await {
                        Ok(tasks) => {
                            if !tasks.is_empty() {
                                info!(
                                    "Background sync fetched {} MS To Do tasks",
                                    tasks.len()
                                );
                                let _ = app_handle.emit("mstodo:tasks-synced", &tasks);
                            }
                        }
                        Err(e) => {
                            error!("Background MS To Do sync error: {}", e);
                        }
                    }
                }
            }

            // Sleep 300 seconds (5 minutes) between syncs.
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(Mutex::new(SyncState {
            last_history_id: None,
            calendar_sync_token: None,
            gtasks_list_id: None,
            outlook_delta_link: None,
            ms_calendar_delta_link: None,
            mstodo_list_id: None,
        }))
        .invoke_handler(tauri::generate_handler![
            // Gmail (6)
            gmail_auth_start,
            gmail_auth_callback,
            gmail_auth_status,
            gmail_auth_disconnect,
            gmail_sync,
            gmail_send,
            // Calendar (4)
            calendar_sync,
            calendar_create_event,
            calendar_update_event,
            calendar_delete_event,
            // Google Tasks (4)
            gtasks_sync,
            gtasks_create,
            gtasks_update,
            gtasks_complete,
            // Microsoft 365 — Auth (3)
            ms_auth_start,
            ms_auth_status,
            ms_auth_disconnect,
            // Microsoft 365 — Outlook (2)
            outlook_sync,
            outlook_send,
            // Microsoft 365 — Calendar (4)
            ms_calendar_sync,
            ms_calendar_create_event,
            ms_calendar_update_event,
            ms_calendar_delete_event,
            // Microsoft 365 — To Do (4)
            mstodo_sync,
            mstodo_create,
            mstodo_update,
            mstodo_complete,
            // AI Suggestions (1)
            generate_suggestions,
            // Token sync from Vercel (2)
            sync_google_tokens,
            sync_microsoft_tokens,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start background sync timer (Gmail + Calendar + Tasks).
            start_background_sync(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
