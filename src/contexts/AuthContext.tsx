import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { mockProfile } from "@/lib/mockData";
import { setToken, clearToken, getToken, api } from "@/lib/api";

interface User { id: string; name: string; email: string; role: string; firm: string; avatar?: string|null; }

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

  // Check existing session on mount
  useEffect(() => {
    const token = getToken();
    const demoFlag = localStorage.getItem("lexai_demo");
    if (demoFlag === "true") {
      setDemo(true); setAuth(true); setUser(mockProfile); setLoading(false);
      return;
    }
    if (token) {
      api<any>("/api/dashboard").then((data) => {
        const p = data.profile || data;
        setUser({ id: p.id||"u", name: p.name||p.full_name||"Abogado", email: p.email||"", role: p.role||"Abogado", firm: p.firm||"" });
        setAuth(true);
      }).catch(() => { clearToken(); }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Try real Supabase auth via backend
    try {
      const res = await fetch((import.meta.env.VITE_API_BASE_URL || "https://lexai-omega.vercel.app") + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const token = data.access_token || data.data?.access_token;
        if (token) {
          setToken(token);
          const profile = data.profile || data.data?.profile || { name: email.split("@")[0] };
          setUser({ id: profile.id||"u", name: profile.name||profile.full_name||email, email, role: profile.role||"Abogado", firm: profile.firm||"" });
          setAuth(true);
          setDemo(false);
          return;
        }
      }
      // Auth failed — throw so Login page can show the error
      throw new Error(data.error || data.message || "Credenciales inválidas");
    } catch (e: any) {
      throw new Error(e.message || "Error de conexión. Intenta el modo demo.");
    }
  }, []);

  const logout = useCallback(() => {
    setAuth(false); setUser(null); setDemo(false);
    clearToken();
    localStorage.removeItem("lexai_demo");
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
