/**
 * LexAI API Layer — Tauri Edition
 *
 * Replaces the old fetch-to-Vercel approach with:
 *   - Direct Supabase queries for CRUD (cases, journal, time entries, emails)
 *   - Tauri invoke() for AI (Ollama/Claude/Gemini) and secure ops (Gmail, Calendar)
 *   - Falls back to web fetch() when running outside Tauri (dev in browser)
 *
 * IMPORTANT: The public API surface (api, apiPost, apiDelete, streamSSE, etc.)
 * stays the same so pages don't need changes.
 */

import { supabase } from "./supabase";

// Detect if we're inside Tauri or a regular browser
const isTauri = typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

// Dynamic import of Tauri invoke (only available inside Tauri runtime)
let invoke: ((cmd: string, args?: any) => Promise<any>) | null = null;
if (isTauri) {
  import("@tauri-apps/api/core").then((mod) => {
    invoke = mod.invoke;
  });
}

// Legacy fallback for browser-only dev
const LEGACY_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://lexai-omega.vercel.app";

// ── Token helpers (kept for backward compat during migration) ──────────────
export function getToken() {
  return localStorage.getItem("lexai_token");
}
export function setToken(t: string) {
  localStorage.setItem("lexai_token", t);
}
export function clearToken() {
  localStorage.removeItem("lexai_token");
}

// ── Route mapping: old API paths → new handlers ────────────────────────────

type RouteHandler = (params?: Record<string, string>, body?: any) => Promise<any>;

const supabaseRoutes: Record<string, RouteHandler> = {
  // Dashboard
  "/api/dashboard": async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");

    const [cases, emails, timeEntries] = await Promise.all([
      supabase.from("cases").select("id", { count: "exact" }).eq("user_id", user.id),
      supabase.from("emails").select("id", { count: "exact" }).eq("user_id", user.id),
      supabase.from("time_entries").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    return {
      profile: { id: user.id, name: user.user_metadata?.name || user.email, email: user.email, role: "Abogado", firm: "" },
      stats: { cases: cases.count || 0, emails: emails.count || 0 },
      recentTimeEntries: timeEntries.data || [],
    };
  },

  // Cases
  "/api/cases": async (params) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Client journal
  "/api/client-journal": async (params) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    let query = supabase.from("journal_entries").select("*").eq("user_id", user.id);
    if (params?.case_id) query = query.eq("case_id", params.case_id);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Corpus search (direct Supabase RPC — no backend needed)
  "/api/corpus/search": async (params) => {
    const q = params?.q || "";
    const mode = params?.mode || "keyword";
    const limit = parseInt(params?.limit || "20");

    if (mode === "keyword") {
      const { data, error } = await supabase
        .from("legal_corpus")
        .select("id, title, doc_number, source, doc_date, full_text")
        .textSearch("fts", q.split(" ").join(" & "))
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((d: any) => ({
        ...d,
        snippet: d.full_text?.substring(0, 300) + "...",
      }));
    }

    // Hybrid/semantic search via RPC (if available)
    const { data, error } = await supabase.rpc("hybrid_search", {
      query_text: q,
      match_count: limit,
    });
    if (error) {
      // Fallback to keyword search if RPC not available
      console.warn("hybrid_search RPC not available, falling back to keyword:", error.message);
      const { data: fallback } = await supabase
        .from("legal_corpus")
        .select("id, title, doc_number, source, doc_date, full_text")
        .textSearch("fts", q.split(" ").join(" & "))
        .limit(limit);
      return (fallback || []).map((d: any) => ({
        ...d,
        snippet: d.full_text?.substring(0, 300) + "...",
      }));
    }
    return data || [];
  },

  // Triage config
  "/api/triage-config": async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("user_triage_config")
      .select("*")
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Suggestions (proactive, pending)
  "/api/suggestions": async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("suggestions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Calendar events
  "/api/calendar-events": async (params) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Emails (list) — maps DB columns (subject_enc, from_enc, etc.) to UI fields (subject, from, etc.)
  "/api/emails": async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("emails")
      .select("id, user_id, subject_enc, from_enc, to_address, body_enc, body_html_enc, snippet, gmail_date, internal_date, is_unread, label_ids, ai_urgency, ai_category, ai_summary, ai_type, ai_plazo, ai_estimated_hours, synced_at")
      .eq("user_id", user.id)
      .order("internal_date", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    // Map encrypted/raw column names to what pages expect
    return (data || []).map((e: any) => ({
      id: e.id,
      subject: e.subject_enc || "(Sin asunto)",
      from: e.from_enc || "",
      to: e.to_address || "",
      body: e.body_enc || e.snippet || "",
      bodyHtml: e.body_html_enc || null,
      date: e.internal_date || e.gmail_date || e.synced_at,
      urgency: e.ai_urgency || "media",
      read: !e.is_unread,
      labels: e.label_ids || [],
      ai_analysis: {
        urgency: e.ai_urgency || "media",
        category: e.ai_category || "",
        summary: e.ai_summary || "",
        type: e.ai_type || "",
        deadline: e.ai_plazo || null,
        estimated_hours: e.ai_estimated_hours || null,
      },
    }));
  },
};

// Graph API routes (always go through Vercel backend)
const graphGetRoutes: Record<string, RouteHandler> = {
  "/api/graph/stats": async () => {
    return legacyFetchWithSupabaseAuth("/api/graph/stats", "GET");
  },
  "/api/graph/subgraph": async (params) => {
    const qs = new URLSearchParams(params || {}).toString();
    return legacyFetchWithSupabaseAuth(`/api/graph/subgraph?${qs}`, "GET");
  },
  "/api/graph/neighbors": async (params) => {
    const qs = new URLSearchParams(params || {}).toString();
    return legacyFetchWithSupabaseAuth(`/api/graph/neighbors?${qs}`, "GET");
  },
};

const graphPostRoutes: Record<string, (body: any) => Promise<any>> = {
  "/api/graph/rag": (body) => legacyFetchWithSupabaseAuth("/api/graph/rag", "POST", body),
};

// Routes that need Tauri invoke (AI, Gmail API, Calendar API)
const tauriRoutes: Record<string, (body?: any) => Promise<any>> = {
  "/api/claude-orchestra-v2": (body) => legacyFetchWithSupabaseAuth("/api/claude-orchestra-v2", "POST", { query: body.message, context: body.context }),
  "/api/deep-research": (body) => legacyFetchWithSupabaseAuth("/api/deep-research", "POST", { query: body.message, mode: body.mode || "cross-check" }),
  "/api/news": () => invoke?.("fetch_news") ?? legacyFetchWithSupabaseAuth("/api/news", "GET"),
  "/api/news/analyze": (body) => legacyFetchWithSupabaseAuth("/api/news/analyze", "POST", body),
};

// POST routes that write to Supabase
const postRoutes: Record<string, (body: any) => Promise<any>> = {
  "/api/cases": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase.from("cases").insert({ ...body, user_id: user.id }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  "/api/client-journal": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase.from("journal_entries").insert({ ...body, user_id: user.id }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  "/api/emails": async (body) => {
    // Email sync — goes through Tauri if available
    if (invoke) return invoke("gmail_sync");
    return legacyFetch("/api/emails", "POST", body);
  },

  "/api/triage-config": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    const { data, error } = await supabase
      .from("user_triage_config")
      .upsert({ ...body, user_id: user.id }, { onConflict: "user_id,config_key" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  "/api/suggestions/accept": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    await supabase.from("suggestions").update({ status: "accepted" }).eq("id", body.id).eq("user_id", user.id);
    return { success: true };
  },

  "/api/suggestions/dismiss": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    await supabase.from("suggestions").update({ status: "dismissed" }).eq("id", body.id).eq("user_id", user.id);
    return { success: true };
  },

  "/api/triage-override": async (body) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autorizado");
    // Update email urgency
    await supabase.from("emails").update({
      triage_overridden: true,
      original_urgency: body.original_urgency,
      urgency: body.new_urgency,
    }).eq("id", body.email_id).eq("user_id", user.id);
    // Insert labeled example for learning
    const { data, error } = await supabase.from("labeled_examples").insert({
      user_id: user.id,
      email_id: body.email_id,
      email_text: body.email_text,
      email_subject: body.email_subject,
      email_from: body.email_from,
      field: "urgency",
      predicted_label: body.original_urgency,
      corrected_label: body.new_urgency,
      confidence: body.confidence,
      triage_stage: body.triage_stage,
      triage_factors: body.triage_factors,
      override_reason: body.reason,
      sender_email: body.sender_email,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
};

// ── Legacy fetch with Supabase auth (for Tauri → Vercel API calls) ──────

async function legacyFetchWithSupabaseAuth(path: string, method: string = "GET", body?: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || getToken();
  const url = new URL(path, LEGACY_BASE_URL);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || e.message || `Error ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Legacy fetch fallback (for when running in browser without Tauri) ──────

async function legacyFetch(path: string, method: string = "GET", body?: any): Promise<any> {
  const token = getToken();
  const url = new URL(path, LEGACY_BASE_URL);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("No autorizado");
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || e.message || `Error ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Public API (same surface as before — pages don't change) ───────────────

export async function api<T = any>(
  path: string,
  opts?: RequestInit & { params?: Record<string, string> }
): Promise<T> {
  const params = opts?.params;

  // Check if this is a Supabase-direct route
  if (supabaseRoutes[path]) {
    return supabaseRoutes[path](params) as Promise<T>;
  }

  // Check if this is a Graph API route
  if (graphGetRoutes[path]) {
    return graphGetRoutes[path](params) as Promise<T>;
  }

  // Check if this is a Tauri route
  if (tauriRoutes[path] && invoke) {
    return tauriRoutes[path]() as Promise<T>;
  }

  // Fallback to legacy web fetch
  return legacyFetch(path, opts?.method || "GET", opts?.body ? JSON.parse(opts.body as string) : undefined) as Promise<T>;
}

export const apiPost = <T = any>(p: string, body: any): Promise<T> => {
  // Check Supabase POST routes first
  if (postRoutes[p]) {
    return postRoutes[p](body) as Promise<T>;
  }
  // Check Graph API POST routes
  if (graphPostRoutes[p]) {
    return graphPostRoutes[p](body) as Promise<T>;
  }
  // Check Tauri routes
  if (tauriRoutes[p] && invoke) {
    return tauriRoutes[p](body) as Promise<T>;
  }
  // Legacy fallback
  return legacyFetch(p, "POST", body) as Promise<T>;
};

export const apiPatch = <T = any>(p: string, body: any): Promise<T> => {
  // Generic Supabase patch — extract table and id from path
  // e.g., /api/cases/123 → table: cases, id: 123
  const match = p.match(/\/api\/([^/]+)\/([^/]+)/);
  if (match) {
    const [, table, id] = match;
    const tableMap: Record<string, string> = {
      cases: "cases",
      "client-journal": "journal_entries",
      "case-journal": "journal_entries",
      "time-entries": "time_entries",
    };
    const dbTable = tableMap[table];
    if (dbTable) {
      return (async () => {
        const { data, error } = await supabase.from(dbTable).update(body).eq("id", id).select().single();
        if (error) throw new Error(error.message);
        return data;
      })() as Promise<T>;
    }
  }
  return legacyFetch(p, "PATCH", body) as Promise<T>;
};

export const apiDelete = <T = any>(p: string): Promise<T> => {
  const match = p.match(/\/api\/([^/]+)\/([^/]+)/);
  if (match) {
    const [, table, id] = match;
    const tableMap: Record<string, string> = {
      cases: "cases",
      "client-journal": "journal_entries",
      "case-journal": "journal_entries",
      "time-entries": "time_entries",
    };
    const dbTable = tableMap[table];
    if (dbTable) {
      return (async () => {
        const { error } = await supabase.from(dbTable).delete().eq("id", id);
        if (error) throw new Error(error.message);
        return {} as T;
      })() as Promise<T>;
    }
  }
  return legacyFetch(p, "DELETE") as Promise<T>;
};

/** SSE streaming for AI chat — uses Tauri event listener or legacy SSE */
export async function* streamSSE(
  path: string,
  body: any
): AsyncGenerator<string> {
  // Route through tauriRoutes if available (these now use legacyFetchWithSupabaseAuth)
  if (tauriRoutes[path]) {
    try {
      const result = await tauriRoutes[path](body);
      // Emit as a single chunk matching the SSE format the pages expect
      yield JSON.stringify({
        type: "content",
        text: result.content || result.text || result.answer || (typeof result === "string" ? result : JSON.stringify(result)),
        sources: result.sources || [],
        confidence: result.confidence || 0.8,
        tools: result._meta?.tools_used || [],
        verification: result._verification || null,
      });
      yield JSON.stringify({ type: "done" });
      return;
    } catch (e: any) {
      yield JSON.stringify({ type: "error", text: e.message });
      return;
    }
  }

  // Legacy SSE streaming (browser-only fallback)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || getToken();
  const res = await fetch(LEGACY_BASE_URL + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token || ""}`,
      "Content-Type": "application/json",
    },
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

/** Safe fetch wrapper — returns null on error */
export async function safeFetch<T>(
  path: string,
  opts?: Parameters<typeof api>[1]
): Promise<T | null> {
  try {
    return await api<T>(path, opts);
  } catch {
    return null;
  }
}
