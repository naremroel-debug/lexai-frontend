// LEXAI PATCH-ALL — Run this from the frontend root directory
// Usage: node PATCH-ALL.js

const fs = require('fs');
const path = require('path');

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  OK: ' + filePath);
}

console.log('\n=== LEXAI PATCH-ALL ===\n');

// ═══════════════════════════════════════
// 1. API Helper with SSE streaming
// ═══════════════════════════════════════
writeFile('src/lib/api.ts', `const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://lexai-omega.vercel.app";

export function getToken() { return localStorage.getItem("lexai_token"); }
export function setToken(t: string) { localStorage.setItem("lexai_token", t); }
export function clearToken() { localStorage.removeItem("lexai_token"); }

export async function api<T = any>(path: string, opts?: RequestInit & { params?: Record<string,string> }): Promise<T> {
  const token = getToken();
  const url = new URL(path, BASE_URL);
  if (opts?.params) Object.entries(opts.params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), {
    ...opts,
    headers: { Authorization: token ? \`Bearer \${token}\` : "", "Content-Type": "application/json", ...opts?.headers },
  });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("No autorizado"); }
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || e.message || \`Error \${res.status}\`); }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export const apiPost = <T=any>(p: string, body: any) => api<T>(p, { method:"POST", body: JSON.stringify(body) });
export const apiPatch = <T=any>(p: string, body: any) => api<T>(p, { method:"PATCH", body: JSON.stringify(body) });
export const apiDelete = <T=any>(p: string) => api<T>(p, { method:"DELETE" });

export async function* streamSSE(path: string, body: any): AsyncGenerator<string> {
  const token = getToken();
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { Authorization: \`Bearer \${token || ""}\`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(\`Stream error \${res.status}\`);
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\\n");
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
`);

// ═══════════════════════════════════════
// 2. useApiData hook — ARRAY SAFE
// ═══════════════════════════════════════
writeFile('src/hooks/use-api-data.ts', `import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface Opts<T> {
  path: string;
  params?: Record<string, string>;
  mockData: T;
  enabled?: boolean;
}

export function useApiData<T>({ path, params, mockData, enabled = true }: Opts<T>) {
  const { isDemo } = useAuth();
  const [data, setData] = useState<T>(mockData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !enabled) { setData(mockData); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    api<T>(path, { params })
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(mockData) && !Array.isArray(d)) {
          const arr = (d as any)?.data || (d as any)?.results || (d as any)?.items;
          setData(Array.isArray(arr) ? arr as T : mockData);
        } else { setData(d); }
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setData(mockData); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, isDemo, enabled, JSON.stringify(params)]);

  const refetch = () => {
    if (isDemo) return;
    setLoading(true); setError(null);
    api<T>(path, { params })
      .then((d) => {
        if (Array.isArray(mockData) && !Array.isArray(d)) {
          const arr = (d as any)?.data || (d as any)?.results;
          setData(Array.isArray(arr) ? arr as T : mockData);
        } else { setData(d); }
      })
      .catch((e) => { setError(e.message); setData(mockData); })
      .finally(() => setLoading(false));
  };

  return { data, loading, error, refetch, isDemo };
}
`);

// ═══════════════════════════════════════
// 3. AuthContext — real auth + demo, NO silent fallback
// ═══════════════════════════════════════
writeFile('src/contexts/AuthContext.tsx', `import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { mockProfile } from "@/lib/mockData";
import { setToken, clearToken, getToken, api } from "@/lib/api";

interface User { id: string; name: string; email: string; role: string; firm: string; }

interface AuthCtx {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  enableDemo: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isDemo, setDemo] = useState(false);

  useEffect(() => {
    const demoFlag = localStorage.getItem("lexai_demo");
    if (demoFlag === "true") {
      setDemo(true); setAuth(true); setUser(mockProfile); setLoading(false);
      return;
    }
    const token = getToken();
    if (token) {
      api<any>("/api/dashboard")
        .then((data) => {
          const p = data.profile || data;
          setUser({ id: p.id||"u", name: p.name||p.full_name||"", email: p.email||"", role: p.role||"Abogado", firm: p.firm||"" });
          setAuth(true);
        })
        .catch(() => { clearToken(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const base = import.meta.env.VITE_API_BASE_URL || "https://lexai-omega.vercel.app";
    const res = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Credenciales inválidas");
    const token = data.access_token || data.data?.access_token;
    if (!token) throw new Error("No se recibió token");
    setToken(token);
    const profile = data.profile || data.data?.profile || {};
    setUser({
      id: profile.id || "u",
      name: profile.name || profile.full_name || email.split("@")[0],
      email, role: profile.role || "Abogado", firm: profile.firm || "",
    });
    setAuth(true);
    setDemo(false);
  }, []);

  const logout = useCallback(() => {
    setAuth(false); setUser(null); setDemo(false);
    clearToken(); localStorage.removeItem("lexai_demo");
  }, []);

  const enableDemo = useCallback(() => {
    setDemo(true); setAuth(true); setUser(mockProfile);
    localStorage.setItem("lexai_demo", "true");
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, isDemo, login, logout, enableDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
`);

// ═══════════════════════════════════════
// 4. Login page — shows errors
// ═══════════════════════════════════════
const loginSrc = fs.readFileSync('src/pages/Login.tsx', 'utf8');
if (!loginSrc.includes('setError')) {
  let fixed = loginSrc
    .replace(
      'const [showPw, setShowPw] = useState(false);',
      'const [showPw, setShowPw] = useState(false);\n  const [error, setError] = useState("");\n  const [loading, setLoading] = useState(false);'
    )
    .replace(
      /const handleLogin = async \(e: React\.FormEvent\) => \{[\s\S]*?navigate\("\/"\);\s*\};/,
      `const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); navigate("/"); }
    catch (err: any) { setError(err.message || "Error al iniciar sesión"); }
    finally { setLoading(false); }
  };`
    )
    .replace(
      'type="submit" className="w-full py-2.5',
      'type="submit" disabled={loading} className="w-full py-2.5'
    )
    .replace(
      'Iniciar sesión\n            </button>',
      '{loading ? "Verificando..." : "Iniciar sesión"}\n            </button>'
    );
  // Add error display before submit button
  fixed = fixed.replace(
    '            <button type="submit"',
    '            {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{error}</div>}\n            <button type="submit"'
  );
  writeFile('src/pages/Login.tsx', fixed);
}

// ═══════════════════════════════════════
// 5. Fix Chips.tsx — case-insensitive ConfidenceBadge + safe HeatBadge
// ═══════════════════════════════════════
let chips = fs.readFileSync('src/components/shared/Chips.tsx', 'utf8');

// Fix ConfidenceBadge
chips = chips.replace(
  /interface ConfidenceBadgeProps \{[\s\S]*?level: "[^"]*"[^}]*\}/,
  'interface ConfidenceBadgeProps {\n  level: string;\n}'
);
chips = chips.replace(
  'const s = styles[level];',
  'const key = (level || "medio").toLowerCase() as keyof typeof styles;\n  const s = styles[key] || styles.medio;'
);

// Fix HeatBadge
chips = chips.replace(
  /export function HeatBadge\(\{ heat \}: \{ heat: "[^"]*"[^}]*\}\)/,
  'export function HeatBadge({ heat }: { heat: string })'
);
chips = chips.replace(
  'return <span className="text-sm">{icons[heat]}</span>',
  'return <span className="text-sm">{icons[heat] || "\\u{1F535}"}</span>'
);

writeFile('src/components/shared/Chips.tsx', chips);

// ═══════════════════════════════════════
// 6. DataStates component
// ═══════════════════════════════════════
writeFile('src/components/shared/DataStates.tsx', `import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-muted rounded-lg" style={{ width: \`\${85 - i * 15}%\` }} />
      ))}
    </div>
  );
}

export function LoadingSpinner({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 text-teal animate-spin mr-2" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-sm text-red-700 dark:text-red-300">{message}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1 text-xs font-medium text-teal hover:underline">
          <RefreshCw className="h-3 w-3" /> Reintentar
        </button>
      )}
    </div>
  );
}
`);

// ═══════════════════════════════════════
// 7. Fix Correos — ensure emails is always array
// ═══════════════════════════════════════
let correos = fs.readFileSync('src/pages/Correos.tsx', 'utf8');
// Ensure safe .find call
correos = correos.replace(
  /const email = .*\.find/,
  'const email = (Array.isArray(emails) ? emails : []).find'
);
writeFile('src/pages/Correos.tsx', correos);

// ═══════════════════════════════════════
// 8. Fix Casos — ensure cases is always array
// ═══════════════════════════════════════
let casos = fs.readFileSync('src/pages/Casos.tsx', 'utf8');
casos = casos.replace(
  /const selected = .*\.find/,
  'const selected = (Array.isArray(cases) ? cases : []).find'
);
casos = casos.replace(
  /const entries = .*\.filter/,
  'const entries = (Array.isArray(journalAll) ? journalAll : []).filter'
);
casos = casos.replace(
  /const filteredCases = .*\.filter/,
  'const filteredCases = (Array.isArray(cases) ? cases : []).filter'
);
writeFile('src/pages/Casos.tsx', casos);

// ═══════════════════════════════════════
// 9. Fix Noticias — ensure news is always array
// ═══════════════════════════════════════
let noticias = fs.readFileSync('src/pages/Noticias.tsx', 'utf8');
noticias = noticias.replace(
  /\? news\.filter/g,
  '? (Array.isArray(news) ? news : []).filter'
);
noticias = noticias.replace(
  /: news\.filter/g,
  ': (Array.isArray(news) ? news : []).filter'
);
writeFile('src/pages/Noticias.tsx', noticias);

console.log('\n=== ALL PATCHES APPLIED ===');
console.log('\nNext: git add -A && git commit -m "fix: complete API integration + array safety" && git push');
console.log('Vercel will auto-deploy in ~30s\n');
