import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface UseApiDataOpts<T> {
  path: string;
  params?: Record<string, string>;
  mockData: T;
  enabled?: boolean;
}

export function useApiData<T>({ path, params, mockData, enabled = true }: UseApiDataOpts<T>) {
  const { isDemo } = useAuth();
  const [data, setData] = useState<T>(mockData);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !enabled) { setData(mockData); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    api<T>(path, { params })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) { setError(e.message); setData(mockData); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, isDemo, enabled, JSON.stringify(params)]);

  const refetch = () => {
    if (isDemo) return;
    setLoading(true); setError(null);
    api<T>(path, { params })
      .then(setData)
      .catch(e => { setError(e.message); setData(mockData); })
      .finally(() => setLoading(false));
  };

  return { data, loading, error, refetch, isDemo };
}
