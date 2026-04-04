/**
 * LexAI Calendar Sync Hook
 *
 * Manages Google Calendar event state via Supabase + Tauri.
 *
 * Listens for Tauri event:
 *   - calendar:events-synced -> upsert to Supabase, reload from DB
 *
 * Provides:
 *   - loadEvents()   -> query calendar_events for -7d to +30d
 *   - manualSync()   -> invoke("calendar_sync"), then loadEvents()
 *   - createEvent()  -> invoke("calendar_create_event", { event })
 *   - State: { events, isSyncing }
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  user_id: string;
  gcal_event_id: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  timezone?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  timezone?: string;
}

interface CalendarSyncState {
  events: CalendarEvent[];
  isSyncing: boolean;
}

interface UseCalendarSyncReturn extends CalendarSyncState {
  loadEvents: () => Promise<void>;
  manualSync: () => Promise<void>;
  createEvent: (input: CalendarEventInput) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCalendarSync(): UseCalendarSyncReturn {
  const { user, isDemo } = useAuth();

  const [state, setState] = useState<CalendarSyncState>({
    events: [],
    isSyncing: false,
  });

  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  // --------------------------------------------------
  // loadEvents: query Supabase for -7d to +30d range
  // --------------------------------------------------
  const loadEvents = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || isDemo) return;

    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      const to = new Date(now);
      to.setDate(to.getDate() + 30);

      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true });

      if (error) {
        console.error("[use-calendar-sync] loadEvents error:", error.message);
        return;
      }

      setState((prev) => ({ ...prev, events: data || [] }));
    } catch (err) {
      console.error("[use-calendar-sync] loadEvents error:", err);
    }
  }, [isDemo]);

  // --------------------------------------------------
  // upsertEvents: batch upsert from Tauri sync payload
  // --------------------------------------------------
  const upsertEvents = useCallback(async (rawEvents: any[]) => {
    const userId = userIdRef.current;
    if (!userId) return;

    try {
      const rows = rawEvents.map((ev: any) => ({
        user_id: userId,
        gcal_event_id: ev.gcal_event_id || ev.id,
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
        .upsert(rows, { onConflict: "user_id,gcal_event_id" });

      if (error) {
        console.error("[use-calendar-sync] upsert error:", error.message);
      }
    } catch (err) {
      console.error("[use-calendar-sync] upsert error:", err);
    }
  }, []);

  // --------------------------------------------------
  // manualSync: invoke Tauri command, then reload
  // --------------------------------------------------
  const manualSync = useCallback(async () => {
    if (isDemo || !isTauri) return;

    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke("calendar_sync");

      const events: any[] = Array.isArray(result)
        ? result
        : (result as any)?.events ?? [];

      if (events.length > 0) {
        await upsertEvents(events);
      }

      await loadEvents();

      setState((prev) => ({ ...prev, isSyncing: false }));
    } catch (err: any) {
      console.error("[use-calendar-sync] manualSync error:", err);
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [isDemo, upsertEvents, loadEvents]);

  // --------------------------------------------------
  // createEvent: invoke Tauri to create GCal event
  // --------------------------------------------------
  const createEvent = useCallback(async (input: CalendarEventInput) => {
    if (isDemo || !isTauri) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("calendar_create_event", { event: input });
      // Reload events after creation
      await loadEvents();
    } catch (err: any) {
      console.error("[use-calendar-sync] createEvent error:", err);
    }
  }, [isDemo, loadEvents]);

  // --------------------------------------------------
  // Tauri event listener: calendar:events-synced
  // --------------------------------------------------
  useEffect(() => {
    if (isDemo || !isTauri || !user) return;

    const unlisteners: Array<() => void> = [];
    let cancelled = false;

    async function registerListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        const unlistenSynced = await listen<any[]>(
          "calendar:events-synced",
          async (event) => {
            if (cancelled) return;
            const events = Array.isArray(event.payload) ? event.payload : [];
            if (events.length > 0) {
              setState((prev) => ({ ...prev, isSyncing: true }));
              try {
                await upsertEvents(events);
                await loadEvents();
              } finally {
                if (!cancelled) {
                  setState((prev) => ({ ...prev, isSyncing: false }));
                }
              }
            }
          },
        );
        unlisteners.push(unlistenSynced);
      } catch (err) {
        console.error("[use-calendar-sync] Failed to register Tauri listeners:", err);
      }
    }

    const registrationDone = registerListeners();

    // Initial load from Supabase
    loadEvents();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        try { unlisten(); } catch {}
      }
      registrationDone.then(() => {
        for (const unlisten of unlisteners) {
          try { unlisten(); } catch {}
        }
      });
    };
  }, [isDemo, user, upsertEvents, loadEvents]);

  return {
    ...state,
    loadEvents,
    manualSync,
    createEvent,
  };
}
