/**
 * LexAI Microsoft Events Hook
 *
 * Manages Microsoft 365 connection state and processes incoming
 * Outlook emails through the triage + task-creation pipeline.
 *
 * Listens for Tauri events:
 *   - outlook:emails-fetched      -> triage, upsert (outlook_id), create tasks/suggestions
 *   - ms-calendar:events-synced   -> upsert to calendar_events (ms_calendar_event_id)
 *   - mstodo:tasks-synced         -> update tasks (mstodo_id)
 *   - ms:auth-required            -> mark disconnected
 *   - ms:sync-error               -> surface error
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

interface MicrosoftState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  newEmailCount: number;
}

interface RawEmail {
  outlook_id?: string;
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

interface UseMicrosoftEventsReturn extends MicrosoftState {
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
    id: raw.outlook_id || raw.id || "",
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

export function useMicrosoftEvents(): UseMicrosoftEventsReturn {
  const { user, isDemo } = useAuth();
  const { context: triageContext } = useTriageContext();

  const [state, setState] = useState<MicrosoftState>({
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

        // 2. Upsert into emails table — use outlook_id column
        const emailRow = {
          outlook_id: emailInput.id,
          from_address: emailInput.from,
          to_addresses: emailInput.to,
          cc_addresses: emailInput.cc || [],
          subject: emailInput.subject,
          body_text: emailInput.body,
          body_html: emailInput.bodyHtml || null,
          date: emailInput.date,
          urgency: triageResult.urgency,
          triage_score: urgencyToScore(triageResult.urgency),
          triage_confidence: triageResult.confidence,
          triage_stage: triageResult.stage,
          triage_factors: triageResult.factors,
          user_id: userId,
        };

        const { error: upsertError } = await supabase
          .from("emails")
          .upsert(emailRow, { onConflict: "user_id,outlook_id" });

        if (upsertError) {
          console.error("[use-microsoft-events] Email upsert error:", upsertError.message);
        }

        // 3. Process through task/suggestion matrix
        await processTriagedEmail(emailInput, triageResult, userId);
        count++;
      } catch (err) {
        console.error("[use-microsoft-events] Error processing email:", err);
      }
    }

    // 4. Batch enrich any new unenriched tasks
    if (count > 0) {
      try {
        await batchEnrichTasks(userId);
      } catch (err) {
        console.error("[use-microsoft-events] Batch enrich error:", err);
      }
    }

    setState((prev) => ({
      ...prev,
      newEmailCount: prev.newEmailCount + count,
      lastSyncAt: new Date().toISOString(),
    }));
  }, []);

  // --------------------------------------------------
  // Upsert calendar events from ms-calendar:events-synced
  // --------------------------------------------------
  const upsertCalendarEvents = useCallback(async (rawEvents: any[]) => {
    const userId = userIdRef.current;
    if (!userId) return;

    try {
      const rows = rawEvents.map((ev: any) => ({
        user_id: userId,
        ms_calendar_event_id: ev.gcal_event_id || ev.ms_calendar_event_id || ev.id,
        summary: ev.summary || ev.title || "",
        description: ev.description || null,
        location: ev.location || null,
        start_time: ev.start_time || ev.start?.dateTime || ev.start?.date || "",
        end_time: ev.end_time || ev.end?.dateTime || ev.end?.date || "",
        all_day: ev.all_day ?? ev.allDay ?? false,
        timezone: ev.timezone || ev.start?.timeZone || "America/Lima",
        status: ev.status || "confirmed",
      }));

      if (rows.length === 0) return;

      const { error } = await supabase
        .from("calendar_events")
        .upsert(rows, { onConflict: "user_id,ms_calendar_event_id" });

      if (error) {
        console.error("[use-microsoft-events] Calendar upsert error:", error.message);
      }
    } catch (err) {
      console.error("[use-microsoft-events] Calendar upsert error:", err);
    }
  }, []);

  // --------------------------------------------------
  // Upsert tasks from mstodo:tasks-synced
  // --------------------------------------------------
  const upsertTasks = useCallback(async (rawTasks: any[]) => {
    const userId = userIdRef.current;
    if (!userId) return;

    try {
      const rows = rawTasks.map((t: any) => ({
        user_id: userId,
        mstodo_id: t.mstodo_id || t.id,
        title: t.title || t.summary || "",
        description: t.description || t.notes || null,
        due_date: t.due_date || t.due || null,
        status: t.status || "pending",
      }));

      if (rows.length === 0) return;

      const { error } = await supabase
        .from("tasks")
        .upsert(rows, { onConflict: "user_id,mstodo_id" });

      if (error) {
        console.error("[use-microsoft-events] Tasks upsert error:", error.message);
      }
    } catch (err) {
      console.error("[use-microsoft-events] Tasks upsert error:", err);
    }
  }, []);

  // --------------------------------------------------
  // connect: start Microsoft OAuth flow via Tauri
  // --------------------------------------------------
  const connect = useCallback(async () => {
    if (isDemo || !isTauri) return;

    setState((prev) => ({ ...prev, syncError: null }));
    connectCancelledRef.current = false;

    try {
      const { invoke } = await import("@tauri-apps/api/core");

      await invoke("ms_auth_start");

      // Poll for auth completion (timeout: 2 minutes, cancellable on unmount)
      const maxAttempts = 60;
      let attempt = 0;
      let connected = false;

      while (attempt < maxAttempts && !connectCancelledRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        attempt++;

        try {
          const status = await invoke("ms_auth_status");
          if (status === true || status === "connected") {
            connected = true;
            break;
          }
        } catch {
          // Auth still in progress
        }
      }

      if (connected) {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          syncError: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          syncError: "Tiempo de espera agotado para autenticación de Microsoft",
        }));
      }
    } catch (err: any) {
      console.error("[use-microsoft-events] connect error:", err);
      setState((prev) => ({
        ...prev,
        syncError: typeof err === "string" ? err : err?.message || "Error de conexión Microsoft",
      }));
    }
  }, [isDemo]);

  // --------------------------------------------------
  // disconnect: revoke Microsoft tokens via Tauri
  // --------------------------------------------------
  const disconnect = useCallback(async () => {
    if (isDemo || !isTauri) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ms_auth_disconnect");
      setState((prev) => ({
        ...prev,
        isConnected: false,
        syncError: null,
        newEmailCount: 0,
      }));
    } catch (err: any) {
      console.error("[use-microsoft-events] disconnect error:", err);
      setState((prev) => ({
        ...prev,
        syncError: typeof err === "string" ? err : err?.message || "Error al desconectar Microsoft",
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
      const result = await invoke("outlook_sync");

      // Result may be an array of emails or an object with an emails field
      const emails: RawEmail[] = Array.isArray(result)
        ? result
        : (result as any)?.emails ?? [];

      if (emails.length > 0) {
        await processEmails(emails);
      }

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      console.error("[use-microsoft-events] manualSync error:", err);
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

        // outlook:emails-fetched
        const unlistenFetched = await listen<RawEmail[]>(
          "outlook:emails-fetched",
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

        // ms-calendar:events-synced
        const unlistenCalendar = await listen<any[]>(
          "ms-calendar:events-synced",
          async (event) => {
            if (cancelled) return;
            const events = Array.isArray(event.payload) ? event.payload : [];
            if (events.length > 0) {
              setState((prev) => ({ ...prev, isSyncing: true }));
              try {
                await upsertCalendarEvents(events);
              } finally {
                if (!cancelled) {
                  setState((prev) => ({ ...prev, isSyncing: false }));
                }
              }
            }
          },
        );
        unlisteners.push(unlistenCalendar);

        // mstodo:tasks-synced
        const unlistenTasks = await listen<any[]>(
          "mstodo:tasks-synced",
          async (event) => {
            if (cancelled) return;
            const tasks = Array.isArray(event.payload) ? event.payload : [];
            if (tasks.length > 0) {
              setState((prev) => ({ ...prev, isSyncing: true }));
              try {
                await upsertTasks(tasks);
              } finally {
                if (!cancelled) {
                  setState((prev) => ({ ...prev, isSyncing: false }));
                }
              }
            }
          },
        );
        unlisteners.push(unlistenTasks);

        // ms:auth-required
        const unlistenAuth = await listen<unknown>(
          "ms:auth-required",
          () => {
            if (cancelled) return;
            setState((prev) => ({
              ...prev,
              isConnected: false,
              syncError: "Microsoft desconectado",
            }));
          },
        );
        unlisteners.push(unlistenAuth);

        // ms:sync-error
        const unlistenSyncErr = await listen<string | { message?: string }>(
          "ms:sync-error",
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
        console.error("[use-microsoft-events] Failed to register Tauri listeners:", err);
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
  }, [isDemo, user, processEmails, upsertCalendarEvents, upsertTasks]);

  return {
    ...state,
    connect,
    disconnect,
    manualSync,
  };
}
