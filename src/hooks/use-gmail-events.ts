/**
 * LexAI Gmail Events Hook
 *
 * Manages Gmail connection state and processes incoming emails
 * through the triage + task-creation pipeline.
 *
 * Listens for Tauri events:
 *   - gmail:emails-fetched  -> triage, upsert, create tasks/suggestions
 *   - gmail:auth-required   -> mark disconnected
 *   - gmail:sync-error      -> surface error
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTriageContext } from "@/hooks/use-triage-context";
import { triageEmail } from "@/lib/email-triage";
import type { EmailInput } from "@/lib/email-triage";
import { processTriagedEmail, batchEnrichTasks } from "@/lib/email-to-tasks";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GmailState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  newEmailCount: number;
}

interface RawEmail {
  gmail_id?: string;
  id?: string;
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  body_html?: string;
  bodyHtml?: string;
  date?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; mimeType: string; size: number }[];
  thread_id?: string;
  threadId?: string;
  thread_messages?: number;
  threadMessages?: number;
  thread_participants?: string[];
  threadParticipants?: string[];
}

interface UseGmailEventsReturn extends GmailState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  manualSync: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

/** Normalize a raw email payload (from Tauri/Rust) into EmailInput. */
function mapToEmailInput(raw: RawEmail): EmailInput {
  const toArray = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  };

  return {
    id: raw.gmail_id || raw.id || "",
    from: raw.from || "",
    to: toArray(raw.to),
    cc: toArray(raw.cc),
    bcc: toArray(raw.bcc),
    subject: raw.subject || "",
    body: raw.body || "",
    bodyHtml: raw.body_html || raw.bodyHtml,
    date: raw.date || new Date().toISOString(),
    headers: raw.headers,
    attachments: raw.attachments,
    threadId: raw.thread_id || raw.threadId,
    threadMessages: raw.thread_messages ?? raw.threadMessages,
    threadParticipants: raw.thread_participants || raw.threadParticipants,
  };
}

/** Map urgency string to numeric triage_score for DB storage. */
function urgencyToScore(urgency: string): number {
  switch (urgency) {
    case "critical": return 10;
    case "high": return 8;
    case "medium": return 5;
    case "low": return 3;
    case "auto-archive": return 1;
    default: return 5;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGmailEvents(): UseGmailEventsReturn {
  const { user, isDemo } = useAuth();
  const { context: triageContext } = useTriageContext();

  const [state, setState] = useState<GmailState>({
    isConnected: false,
    isSyncing: false,
    lastSyncAt: null,
    syncError: null,
    newEmailCount: 0,
  });

  // Keep latest triageContext in a ref so event listeners see fresh data
  const triageCtxRef = useRef(triageContext);
  triageCtxRef.current = triageContext;

  const userIdRef = useRef(user?.id);
  const connectCancelledRef = useRef(false);
  userIdRef.current = user?.id;

  // --------------------------------------------------
  // Process a batch of raw emails through the pipeline
  // --------------------------------------------------
  const processEmails = useCallback(async (rawEmails: RawEmail[]) => {
    const userId = userIdRef.current;
    if (!userId) return;

    let count = 0;

    for (const raw of rawEmails) {
      try {
        const emailInput = mapToEmailInput(raw);
        if (!emailInput.id) continue;

        // 1. Triage
        const triageResult = triageEmail(emailInput, triageCtxRef.current ?? undefined);

        // 2. Upsert into emails table (matches backend schema: id, subject_enc, from_enc, etc.)
        // Note: Tauri stores plaintext — encryption is only on the Vercel backend.
        // We use the unencrypted-friendly columns and snippet for body preview.
        const emailRow: Record<string, any> = {
          id: emailInput.id,
          user_id: userId,
          subject_enc: emailInput.subject,  // stored as plaintext from Tauri (backend encrypts)
          from_enc: emailInput.from,
          to_address: Array.isArray(emailInput.to) ? emailInput.to.join(", ") : emailInput.to,
          body_enc: (emailInput.body || "").slice(0, 15000),
          snippet: (emailInput.body || "").slice(0, 200),
          gmail_date: emailInput.date,
          internal_date: emailInput.date ? new Date(emailInput.date).toISOString() : new Date().toISOString(),
          is_unread: true,
          label_ids: [],
          synced_at: new Date().toISOString(),
          ai_urgency: triageResult.urgency,
          ai_category: triageResult.factors?.join(", ") || null,
        };

        if (emailInput.bodyHtml) {
          emailRow.body_html_enc = emailInput.bodyHtml.slice(0, 50000);
        }

        const { error: upsertError } = await supabase
          .from("emails")
          .upsert(emailRow, { onConflict: "id" });

        if (upsertError) {
          console.error("[use-gmail-events] Email upsert error:", upsertError.message);
        }

        // 3. Process through task/suggestion matrix
        await processTriagedEmail(emailInput, triageResult, userId);
        count++;
      } catch (err) {
        console.error("[use-gmail-events] Error processing email:", err);
      }
    }

    // 4. Batch enrich any new unenriched tasks
    if (count > 0) {
      try {
        await batchEnrichTasks(userId);
      } catch (err) {
        console.error("[use-gmail-events] Batch enrich error:", err);
      }
    }

    setState((prev) => ({
      ...prev,
      newEmailCount: prev.newEmailCount + count,
      lastSyncAt: new Date().toISOString(),
    }));
  }, []);

  // --------------------------------------------------
  // connect: OAuth flow — go DIRECTLY to Google (bypass Vercel intermediary)
  // Single OAuth for Gmail + Calendar + Drive + Tasks
  // --------------------------------------------------
  const GOOGLE_CLIENT_ID = "450897227009-tfrve9upc8rs0oghuleen67tic2jg99f.apps.googleusercontent.com";
  const GOOGLE_REDIRECT_URI = "https://lexai-omega.vercel.app/api/auth/callback";
  const ALL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" ");

  const connect = useCallback(async () => {
    if (isDemo || !isTauri) return;
    setState(prev => ({ ...prev, syncError: null }));

    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setState(prev => ({ ...prev, syncError: "No hay sesión activa" }));
        return;
      }

      // Build Google OAuth URL directly — no Vercel intermediary
      const userId = session.user.id;
      const state = `${userId}|desktop`;
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: ALL_SCOPES,
        state,
        access_type: "offline",
        prompt: "consent",
      });
      const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

      // Create popup window — goes DIRECTLY to Google consent
      const popup = new WebviewWindow("oauth-google", {
        url: oauthUrl,
        title: "Conectar Google — LexAI",
        width: 600,
        height: 700,
        center: true,
      });

      // Wait for popup to close or detect success via URL polling
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };

        popup.onCloseRequested(() => { done(); });

        // Poll: check if popup navigated to the callback success page
        const interval = setInterval(async () => {
          try {
            // Try to get the popup's current URL via eval
            const { WebviewWindow: WW } = await import("@tauri-apps/api/webviewWindow");
            const win = WW.getByLabel("oauth-google");
            if (!win) { clearInterval(interval); done(); return; }

            // Check if window still exists
            await win.innerPosition();

            // Try to read the URL from the webview
            try {
              const currentUrl = await win.url();
              if (currentUrl.includes("/api/auth/callback") || currentUrl.includes("Conectado")) {
                // Success! Close the popup after a brief delay
                setTimeout(async () => {
                  try { await win.close(); } catch { /* already closed */ }
                  clearInterval(interval);
                  done();
                }, 1500);
              }
            } catch { /* can't read URL yet, keep polling */ }
          } catch {
            // Window is gone
            clearInterval(interval);
            done();
          }
        }, 1000);

        // Timeout after 3 minutes
        setTimeout(() => { clearInterval(interval); done(); }, 180000);
      });

      // After popup closes, fetch tokens from Vercel and sync to keychain
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const tokenSession = (await supabase.auth.getSession()).data.session;
        const res = await fetch(`https://lexai-omega.vercel.app/api/auth/tokens?type=gmail`, {
          headers: { Authorization: `Bearer ${tokenSession?.access_token || ""}` },
        });
        if (res.ok) {
          const json = await res.json();
          const tokens = json.data;
          if (tokens?.access_token) {
            await invoke("sync_google_tokens", {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || "",
              expiresAt: tokens.expires_at || 0,
            });
            setState(prev => ({ ...prev, isConnected: true, syncError: null }));
            return;
          }
        }
      } catch (e) {
        console.error("[use-gmail-events] token sync error:", e);
      }

      // Fallback: check if auth completed via keychain
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const status = await invoke("gmail_auth_status");
        if (status === true || status === "connected") {
          setState(prev => ({ ...prev, isConnected: true, syncError: null }));
        }
      } catch { /* not connected */ }
    } catch (err: any) {
      console.error("[use-gmail-events] connect error:", err);
      setState(prev => ({
        ...prev,
        syncError: typeof err === "string" ? err : err?.message || "Error de conexión Gmail",
      }));
    }
  }, [isDemo]);

  // --------------------------------------------------
  // disconnect: revoke Gmail tokens via Tauri
  // --------------------------------------------------
  const disconnect = useCallback(async () => {
    if (isDemo || !isTauri) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("gmail_auth_disconnect");
      setState((prev) => ({
        ...prev,
        isConnected: false,
        syncError: null,
        newEmailCount: 0,
      }));
    } catch (err: any) {
      console.error("[use-gmail-events] disconnect error:", err);
      setState((prev) => ({
        ...prev,
        syncError: typeof err === "string" ? err : err?.message || "Error al desconectar Gmail",
      }));
    }
  }, [isDemo]);

  // --------------------------------------------------
  // manualSync: trigger sync and process returned emails
  // --------------------------------------------------
  const manualSync = useCallback(async () => {
    if (isDemo || !isTauri) return;

    setState((prev) => ({ ...prev, isSyncing: true, syncError: null }));

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke("gmail_sync");

      // Result may be an array of emails or an object with an emails field
      const emails: RawEmail[] = Array.isArray(result)
        ? result
        : result?.emails ?? [];

      if (emails.length > 0) {
        await processEmails(emails);
      }

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      console.error("[use-gmail-events] manualSync error:", err);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncError: typeof err === "string" ? err : err?.message || "Error de sincronización",
      }));
    }
  }, [isDemo, processEmails]);

  // --------------------------------------------------
  // Tauri event listeners
  // --------------------------------------------------
  useEffect(() => {
    if (isDemo || !isTauri || !user) return;

    // Store unlisten functions for cleanup
    const unlisteners: Array<() => void> = [];
    let cancelled = false;

    async function registerListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        // gmail:emails-fetched
        const unlistenFetched = await listen<RawEmail[]>(
          "gmail:emails-fetched",
          async (event) => {
            if (cancelled) return;
            const emails = Array.isArray(event.payload)
              ? event.payload
              : [];
            if (emails.length > 0) {
              setState((prev) => ({ ...prev, isSyncing: true }));
              try {
                await processEmails(emails);
              } finally {
                if (!cancelled) {
                  setState((prev) => ({ ...prev, isSyncing: false }));
                }
              }
            }
          },
        );
        unlisteners.push(unlistenFetched);

        // gmail:auth-required
        const unlistenAuth = await listen<unknown>(
          "gmail:auth-required",
          () => {
            if (cancelled) return;
            setState((prev) => ({
              ...prev,
              isConnected: false,
              syncError: "Gmail desconectado",
            }));
          },
        );
        unlisteners.push(unlistenAuth);

        // gmail:sync-error
        const unlistenSyncErr = await listen<string | { message?: string }>(
          "gmail:sync-error",
          (event) => {
            if (cancelled) return;
            const msg =
              typeof event.payload === "string"
                ? event.payload
                : event.payload?.message || "Error de sincronización";
            setState((prev) => ({
              ...prev,
              syncError: msg,
              isSyncing: false,
            }));
          },
        );
        unlisteners.push(unlistenSyncErr);
      } catch (err) {
        console.error("[use-gmail-events] Failed to register Tauri listeners:", err);
      }
    }

    const registrationDone = registerListeners();

    return () => {
      cancelled = true;
      connectCancelledRef.current = true; // Cancel any in-progress OAuth polling
      // Unlisten anything already registered
      for (const unlisten of unlisteners) {
        try { unlisten(); } catch {}
      }
      // Also await registration in case it's still in progress, then unlisten stragglers
      registrationDone.then(() => {
        for (const unlisten of unlisteners) {
          try { unlisten(); } catch {}
        }
      });
    };
  }, [isDemo, user, processEmails]);

  return {
    ...state,
    connect,
    disconnect,
    manualSync,
  };
}
