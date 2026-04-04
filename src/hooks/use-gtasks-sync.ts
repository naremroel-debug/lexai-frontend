/**
 * LexAI Google Tasks Sync Hook
 *
 * Simpler hook for Google Tasks management via Tauri.
 *
 * Provides:
 *   - manualSync()     -> invoke("gtasks_sync"), returns task array
 *   - createTask()     -> invoke("gtasks_create", { task })
 *   - completeTask()   -> invoke("gtasks_complete", { taskId })
 *   - State: { isSyncing }
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GTaskInput {
  title: string;
  notes?: string;
  due?: string;
}

interface GTasksSyncState {
  isSyncing: boolean;
}

interface UseGTasksSyncReturn extends GTasksSyncState {
  manualSync: () => Promise<any[]>;
  createTask: (input: GTaskInput) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGTasksSync(): UseGTasksSyncReturn {
  const { isDemo } = useAuth();

  const [state, setState] = useState<GTasksSyncState>({
    isSyncing: false,
  });

  // --------------------------------------------------
  // manualSync: invoke Tauri command, return tasks
  // --------------------------------------------------
  const manualSync = useCallback(async (): Promise<any[]> => {
    if (isDemo || !isTauri) return [];

    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke("gtasks_sync");

      const tasks: any[] = Array.isArray(result)
        ? result
        : (result as any)?.tasks ?? [];

      setState((prev) => ({ ...prev, isSyncing: false }));
      return tasks;
    } catch (err: any) {
      console.error("[use-gtasks-sync] manualSync error:", err);
      setState((prev) => ({ ...prev, isSyncing: false }));
      return [];
    }
  }, [isDemo]);

  // --------------------------------------------------
  // createTask: invoke Tauri to create a Google Task
  // --------------------------------------------------
  const createTask = useCallback(async (input: GTaskInput) => {
    if (isDemo || !isTauri) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("gtasks_create", { task: input });
    } catch (err: any) {
      console.error("[use-gtasks-sync] createTask error:", err);
    }
  }, [isDemo]);

  // --------------------------------------------------
  // completeTask: invoke Tauri to mark task complete
  // --------------------------------------------------
  const completeTask = useCallback(async (taskId: string) => {
    if (isDemo || !isTauri) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("gtasks_complete", { taskId });
    } catch (err: any) {
      console.error("[use-gtasks-sync] completeTask error:", err);
    }
  }, [isDemo]);

  return {
    ...state,
    manualSync,
    createTask,
    completeTask,
  };
}
