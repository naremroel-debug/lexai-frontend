/**
 * Tauri invoke wrapper hook.
 * Provides a React-friendly way to call Rust commands.
 * Falls back gracefully when running in browser (non-Tauri).
 */
import { useState, useCallback } from "react";

const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

let invokeImpl: ((cmd: string, args?: any) => Promise<any>) | null = null;

// Lazy-load the invoke function
if (isTauri) {
  import("@tauri-apps/api/core").then((mod) => {
    invokeImpl = mod.invoke;
  });
}

/**
 * Hook to invoke a Tauri Rust command.
 * Returns { invoke, data, loading, error, isTauri }
 */
export function useTauri<T = any>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tauriInvoke = useCallback(async (cmd: string, args?: Record<string, any>): Promise<T | null> => {
    if (!invokeImpl) {
      setError("Tauri not available");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await invokeImpl(cmd, args);
      setData(result);
      return result;
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e.message || "Tauri command failed";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { invoke: tauriInvoke, data, loading, error, isTauri };
}

/**
 * Check if running inside Tauri.
 */
export function useIsTauri(): boolean {
  return isTauri;
}
