import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadTriageContext, getMockTriageContext } from "@/lib/triage-config";
import type { EnrichedTriageContext } from "@/lib/triage-config";

export function useTriageContext() {
  const { user, isDemo } = useAuth();
  const [context, setContext] = useState<EnrichedTriageContext | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user && !isDemo) return;
    setLoading(true);
    try {
      if (isDemo) {
        setContext(getMockTriageContext());
      } else if (user) {
        const ctx = await loadTriageContext(user.id);
        setContext(ctx);
        // Cache for offline use
        try {
          localStorage.setItem("lexai_triage_context", JSON.stringify(ctx));
        } catch {}
      }
    } catch (err) {
      console.warn("Failed to load triage context, using cached:", err);
      try {
        const cached = localStorage.getItem("lexai_triage_context");
        if (cached) setContext(JSON.parse(cached));
      } catch {}
    }
    setLoading(false);
  }, [user, isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { context, loading, refresh };
}
