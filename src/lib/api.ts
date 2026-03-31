const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://lexai-omega.vercel.app";

export function getToken() { return localStorage.getItem("lexai_token"); }
export function setToken(t: string) { localStorage.setItem("lexai_token", t); }
export function clearToken() { localStorage.removeItem("lexai_token"); }

export async function api<T = any>(path: string, opts?: RequestInit & { params?: Record<string,string> }): Promise<T> {
  const token = getToken();
  const url = new URL(path, BASE_URL);
  if (opts?.params) Object.entries(opts.params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), {
    ...opts,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Content-Type": "application/json", ...opts?.headers },
  });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("No autorizado"); }
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || e.message || `Error ${res.status}`); }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export const apiPost = <T=any>(p: string, body: any) => api<T>(p, { method:"POST", body: JSON.stringify(body) });
export const apiPatch = <T=any>(p: string, body: any) => api<T>(p, { method:"PATCH", body: JSON.stringify(body) });
export const apiDelete = <T=any>(p: string) => api<T>(p, { method:"DELETE" });

/** SSE streaming for AI chat — yields text chunks */
export async function* streamSSE(path: string, body: any): AsyncGenerator<string> {
  const token = getToken();
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Stream error ${res.status}`);
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }
}

/** Safe fetch wrapper — returns null on error instead of throwing */
export async function safeFetch<T>(path: string, opts?: Parameters<typeof api>[1]): Promise<T | null> {
  try { return await api<T>(path, opts); } catch { return null; }
}
