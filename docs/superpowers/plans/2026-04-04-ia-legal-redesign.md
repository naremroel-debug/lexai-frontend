# IA Legal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic IALegal.tsx (358 lines, 3 AI modes, mock data) with a three-column IDE-style layout: Results | Document Viewer | Collapsible Chat.

**Architecture:** Four focused components composed by a thin parent page. SearchBar drives corpus/SPIJ queries. ResultsList shows matches with tabs. DocumentViewer renders full documents with highlights. ChatSidebar provides contextual AI chat with optional bibliography verification. All API calls go through existing `api.ts` layer (Supabase for corpus, `legacyFetchWithSupabaseAuth` for Vercel AI).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-ia-legal-redesign.md`

---

## File Map

**Create:**
- `src/components/ia-legal/SearchBar.tsx` — Top search bar with Cmd+K shortcut
- `src/components/ia-legal/ResultsList.tsx` — Left panel: Corpus/SPIJ tabs + results
- `src/components/ia-legal/DocumentViewer.tsx` — Center panel: document renderer with highlights
- `src/components/ia-legal/ChatSidebar.tsx` — Right panel: collapsible AI chat

**Replace (full rewrite):**
- `src/pages/IALegal.tsx` — Thin parent composing the 4 components

**No changes needed:**
- `src/lib/api.ts` — Corpus search route already exists, claude-orchestra-v2 already wired
- `src/components/shared/Chips.tsx` — ToolBadge, SourceLink reused as-is
- `src/lib/mockData.ts` — mockCorpusResults kept as fallback

---

## Shared Types

These types are used across multiple components. Task 1 defines them, all other tasks import them.

```typescript
// Defined in src/pages/IALegal.tsx (parent)

export interface CorpusResult {
  id: string;
  title: string;
  doc_number: string;
  date: string;
  source: string;
  relevance: number;
  snippet: string;
  content?: string; // full document text, loaded on select
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tools?: string[];
  sources?: Array<{ title: string; url: string; domain: string; verified: boolean }>;
}

export type SearchSource = "corpus" | "spij";
export type CorpusMode = "keyword" | "hybrid" | "semantic";
```

---

## Task 1: Create SearchBar Component

**Files:**
- Create: `src/components/ia-legal/SearchBar.tsx`

- [ ] **Step 1: Create the component directory**

```bash
mkdir -p "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main/src/components/ia-legal"
```

- [ ] **Step 2: Write SearchBar.tsx**

```typescript
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  loading: boolean;
}

export function SearchBar({ query, onQueryChange, onSearch, loading }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="bg-card border-b px-4 py-3">
      <div className="flex items-center gap-2 bg-background border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-teal/50 transition-shadow">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
          placeholder="Buscar norma, decreto, ley, o preguntar a la IA..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && <span className="text-xs text-muted-foreground animate-pulse">Buscando...</span>}
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-xs text-muted-foreground border rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

Expected: Build passes (component isn't imported yet, tree-shaking ignores it).

- [ ] **Step 4: Commit**

```bash
git add src/components/ia-legal/SearchBar.tsx
git commit -m "feat(ia-legal): add SearchBar component with Cmd+K shortcut"
```

---

## Task 2: Create ResultsList Component

**Files:**
- Create: `src/components/ia-legal/ResultsList.tsx`

- [ ] **Step 1: Write ResultsList.tsx**

```typescript
import { BookOpen, Globe } from "lucide-react";

export type SearchSource = "corpus" | "spij";
export type CorpusMode = "keyword" | "hybrid" | "semantic";

export interface CorpusResult {
  id: string;
  title: string;
  doc_number: string;
  date: string;
  source: string;
  relevance: number;
  snippet: string;
  content?: string;
}

interface ResultsListProps {
  source: SearchSource;
  onSourceChange: (s: SearchSource) => void;
  corpusMode: CorpusMode;
  onCorpusModeChange: (m: CorpusMode) => void;
  results: CorpusResult[];
  selectedId: string | null;
  onSelect: (r: CorpusResult) => void;
  resultCount: number;
  searchTime: number | null;
}

export function ResultsList({
  source, onSourceChange, corpusMode, onCorpusModeChange,
  results, selectedId, onSelect, resultCount, searchTime,
}: ResultsListProps) {
  return (
    <div className="w-[220px] shrink-0 flex flex-col border-r bg-card">
      {/* Tabs: Corpus / SPIJ */}
      <div className="flex border-b">
        <button
          onClick={() => onSourceChange("corpus")}
          className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
            source === "corpus"
              ? "text-teal border-b-2 border-teal bg-teal/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="h-3 w-3 inline mr-1" />
          Corpus (598)
        </button>
        <button
          onClick={() => onSourceChange("spij")}
          className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${
            source === "spij"
              ? "text-teal border-b-2 border-teal bg-teal/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="h-3 w-3 inline mr-1" />
          SPIJ
        </button>
      </div>

      {/* Search mode pills (corpus only) */}
      {source === "corpus" && (
        <div className="flex gap-1 p-2">
          {(["keyword", "hybrid", "semantic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onCorpusModeChange(m)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                corpusMode === m
                  ? "bg-teal text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Result count */}
      {resultCount > 0 && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground">
          {resultCount} resultados{searchTime !== null ? ` · ${searchTime.toFixed(1)}s` : ""}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
        {results.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Busca una norma para empezar
          </div>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className={`w-full text-left p-2 rounded-md border text-xs transition-all ${
                selectedId === r.id
                  ? "border-teal bg-teal/5"
                  : "border-transparent hover:border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-medium text-foreground line-clamp-2">{r.title}</div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">{r.source} · {r.date?.slice(0, 4)}</span>
                <span className={`font-mono ${selectedId === r.id ? "text-teal" : "text-muted-foreground"}`}>
                  {r.relevance}%
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ia-legal/ResultsList.tsx
git commit -m "feat(ia-legal): add ResultsList component with Corpus/SPIJ tabs"
```

---

## Task 3: Create DocumentViewer Component

**Files:**
- Create: `src/components/ia-legal/DocumentViewer.tsx`

- [ ] **Step 1: Write DocumentViewer.tsx**

```typescript
import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import type { CorpusResult } from "./ResultsList";

interface DocumentViewerProps {
  document: CorpusResult | null;
  searchQuery: string;
  highlightedSection: string | null; // e.g. "Art. 5" — scrolls to this
}

export function DocumentViewer({ document, searchQuery, highlightedSection }: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to highlighted section when it changes
  useEffect(() => {
    if (!highlightedSection || !contentRef.current) return;
    const el = contentRef.current.querySelector(`[data-section="${highlightedSection}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-teal/50");
      const timer = setTimeout(() => el.classList.remove("ring-2", "ring-teal/50"), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedSection]);

  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-card">
        <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">Selecciona un resultado para ver el documento</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-card border-r overflow-hidden">
      {/* Document header */}
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-teal shrink-0" />
          <h2 className="font-serif font-semibold text-sm truncate">{document.title}</h2>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {document.date} · {document.source} · {document.doc_number}
        </div>
      </div>

      {/* Document content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {document.content ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlightContent(document.content, searchQuery, highlightedSection) }}
          />
        ) : (
          <div className="space-y-3">
            {/* Show snippet when full content not available */}
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: document.snippet }}
            />
            <p className="text-xs text-muted-foreground italic">
              Contenido completo no disponible. Mostrando fragmento relevante.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function highlightContent(html: string, query: string, section: string | null): string {
  let result = html;

  // Highlight search terms
  if (query.trim()) {
    const words = query.trim().split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      const regex = new RegExp(`(${escapeRegex(word)})`, "gi");
      result = result.replace(regex, '<mark class="bg-teal/20 text-teal rounded px-0.5">$1</mark>');
    }
  }

  // Highlight referenced section with teal left border
  if (section) {
    const sectionRegex = new RegExp(`(<strong>[^<]*${escapeRegex(section)}[^<]*</strong>)`, "gi");
    result = result.replace(
      sectionRegex,
      `<div data-section="${section}" class="border-l-3 border-teal bg-teal/5 pl-3 py-2 -ml-3 rounded-r">$1</div>`
    );
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 2: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ia-legal/DocumentViewer.tsx
git commit -m "feat(ia-legal): add DocumentViewer with scroll+highlight for chat references"
```

---

## Task 4: Create ChatSidebar Component

**Files:**
- Create: `src/components/ia-legal/ChatSidebar.tsx`

- [ ] **Step 1: Write ChatSidebar.tsx**

```typescript
import { useState, useCallback } from "react";
import { MessageSquare, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { ToolBadge, SourceLink } from "@/components/shared/Chips";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tools?: string[];
  sources?: Array<{ title: string; url: string; domain: string; verified: boolean }>;
}

interface ChatSidebarProps {
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  documentContext: { id: string; title: string } | null;
  onArticleClick: (articleRef: string) => void; // e.g. "Art. 5" → scroll in viewer
}

export function ChatSidebar({ messages, onMessagesChange, documentContext, onArticleClick }: ChatSidebarProps) {
  const { isDemo } = useAuth();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [verify, setVerify] = useState(false);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };
    const updated = [...messages, userMsg];
    onMessagesChange(updated);
    setInput("");

    if (isDemo) return;

    setStreaming(true);
    try {
      const res = await apiPost("/api/claude-orchestra-v2", {
        query: input,
        context: {
          document_id: documentContext?.id || null,
          document_title: documentContext?.title || null,
          verify,
        },
      });

      const data = res?.data ?? res;
      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        content: data?.answer || data?.content || data?.text || (typeof data === "string" ? data : JSON.stringify(data)),
        timestamp: new Date().toISOString(),
        tools: data?._meta?.tools_used || data?.tools || [],
        sources: data?.sources || [],
      };
      onMessagesChange([...updated, aiMsg]);
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `⚠ Error: ${e.message}`,
        timestamp: new Date().toISOString(),
      };
      onMessagesChange([...updated, errMsg]);
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, isDemo, messages, onMessagesChange, documentContext, verify]);

  // Collapsed state: thin bar with icon
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-10 shrink-0 flex flex-col items-center justify-center gap-2 bg-card border-l hover:bg-muted/50 transition-colors"
        title="Mostrar chat"
      >
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <ChevronLeft className="h-3 w-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="w-[240px] shrink-0 flex flex-col bg-card border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Chat IA
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
        >
          Ocultar <ChevronRight className="h-2.5 w-2.5 inline" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            {documentContext
              ? `Pregunta sobre "${documentContext.title}"`
              : "Busca un documento y pregunta sobre él"
            }
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-teal text-accent-foreground rounded-br-sm"
                  : "bg-muted border rounded-bl-sm"
              }`}>
                <ChatContent content={msg.content} onArticleClick={onArticleClick} />
                {msg.tools && msg.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-border/50">
                    {msg.tools.map((t) => <ToolBadge key={t} name={t} />)}
                  </div>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-border/50 space-y-0.5">
                    {msg.sources.map((s, i) => <SourceLink key={i} {...s} />)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {streaming && (
          <div className="flex justify-start">
            <div className="bg-muted border rounded-lg px-3 py-2 text-xs animate-pulse">
              Pensando...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t space-y-1.5">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Pregunta sobre este documento..."
            disabled={streaming}
            className="flex-1 px-2.5 py-1.5 rounded-md border bg-background text-xs outline-none focus:ring-1 focus:ring-teal/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-2.5 py-1.5 rounded-md bg-teal text-accent-foreground hover:bg-teal/90 transition-colors disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={verify}
            onChange={(e) => setVerify(e.target.checked)}
            className="rounded border-muted-foreground/50 text-teal focus:ring-teal/50 h-3 w-3"
          />
          <span className="text-[10px] text-muted-foreground">Validar bibliografía (usará más tokens)</span>
        </label>
        <p className="text-[9px] text-muted-foreground/60 text-center">IA puede cometer errores · Verifica siempre</p>
      </div>
    </div>
  );
}

/** Renders chat content with clickable article references */
function ChatContent({ content, onArticleClick }: { content: string; onArticleClick: (ref: string) => void }) {
  // Find article references like "Art. 5", "Artículo 12", etc.
  const parts = content.split(/(Art(?:ículo)?\.?\s*\d+)/gi);

  return (
    <span>
      {parts.map((part, i) => {
        if (/^Art(?:ículo)?\.?\s*\d+$/i.test(part)) {
          return (
            <button
              key={i}
              onClick={() => onArticleClick(part)}
              className="text-teal underline hover:text-teal/80 transition-colors"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ia-legal/ChatSidebar.tsx
git commit -m "feat(ia-legal): add ChatSidebar with collapsible panel and verify checkbox"
```

---

## Task 5: Rewrite IALegal.tsx (Parent Orchestrator)

**Files:**
- Replace: `src/pages/IALegal.tsx`

This is the composition layer. It owns the state and wires the 4 child components together.

- [ ] **Step 1: Replace IALegal.tsx entirely**

Write the new `src/pages/IALegal.tsx`:

```typescript
import { useState, useCallback } from "react";
import { mockCorpusResults } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

import { SearchBar } from "@/components/ia-legal/SearchBar";
import { ResultsList, type CorpusResult, type SearchSource, type CorpusMode } from "@/components/ia-legal/ResultsList";
import { DocumentViewer } from "@/components/ia-legal/DocumentViewer";
import { ChatSidebar, type ChatMessage } from "@/components/ia-legal/ChatSidebar";

export default function IALegal() {
  const { isDemo } = useAuth();

  // Search state
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SearchSource>("corpus");
  const [corpusMode, setCorpusMode] = useState<CorpusMode>("hybrid");
  const [searching, setSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);

  // Results state
  const [results, setResults] = useState<CorpusResult[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<CorpusResult | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    if (isDemo) {
      setResults(mockCorpusResults);
      setSearchTime(0.1);
      return;
    }

    setSearching(true);
    const start = Date.now();

    try {
      if (source === "corpus") {
        const data = await api<CorpusResult[]>("/api/corpus/search", {
          params: { q: query, mode: corpusMode, limit: "20" },
        });
        setResults(data || []);
      } else {
        // SPIJ search via Vercel
        const data = await api<any>("/api/spij/chat", {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", content: query }] }),
        });
        // Map SPIJ response to CorpusResult shape
        const spijResults: CorpusResult[] = (data?.sources || []).map((s: any, i: number) => ({
          id: `spij_${i}`,
          title: s.title || s.name || "Resultado SPIJ",
          doc_number: "",
          date: "",
          source: "SPIJ",
          relevance: 90 - i * 5,
          snippet: s.snippet || s.text || "",
        }));
        setResults(spijResults);
      }
    } catch (e) {
      console.error("[IALegal] search error:", e);
      if (isDemo) setResults(mockCorpusResults);
    } finally {
      setSearchTime((Date.now() - start) / 1000);
      setSearching(false);
    }
  }, [query, source, corpusMode, isDemo]);

  // Select a result → open in viewer
  const handleSelectResult = useCallback((r: CorpusResult) => {
    setSelectedDoc(r);
    setHighlightedSection(null);
  }, []);

  // Chat references an article → highlight in viewer
  const handleArticleClick = useCallback((ref: string) => {
    setHighlightedSection(ref);
  }, []);

  // Document context for chat
  const docContext = selectedDoc ? { id: selectedDoc.id, title: selectedDoc.title } : null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mx-4 lg:-mx-6 -my-6 animate-fade-in">
      {/* Top: Search bar */}
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        loading={searching}
      />

      {/* Main: Three columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Results */}
        <ResultsList
          source={source}
          onSourceChange={setSource}
          corpusMode={corpusMode}
          onCorpusModeChange={setCorpusMode}
          results={results}
          selectedId={selectedDoc?.id || null}
          onSelect={handleSelectResult}
          resultCount={results.length}
          searchTime={searchTime}
        />

        {/* Center: Document viewer */}
        <DocumentViewer
          document={selectedDoc}
          searchQuery={query}
          highlightedSection={highlightedSection}
        />

        {/* Right: Chat sidebar */}
        <ChatSidebar
          messages={messages}
          onMessagesChange={setMessages}
          documentContext={docContext}
          onArticleClick={handleArticleClick}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

Expected: Build passes. The old IALegal.tsx imports (mockChatMessages, formatMarkdown, etc.) are gone. New imports resolve correctly.

- [ ] **Step 3: Visual check — run dev server**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run dev
```

Open `http://localhost:8080/ia-legal` and verify:
- Search bar visible at top with ⌘K hint
- Left panel shows "Busca una norma para empezar" empty state
- Center panel shows document placeholder icon
- Right panel shows chat with "Busca un documento y pregunta sobre él"
- Chat collapse/expand toggle works

- [ ] **Step 4: Commit**

```bash
git add src/pages/IALegal.tsx
git commit -m "feat(ia-legal): rewrite page as three-column IDE layout"
```

---

## Task 6: Responsive Mobile Layout

**Files:**
- Modify: `src/pages/IALegal.tsx`

The three-column layout needs a mobile fallback.

- [ ] **Step 1: Add mobile state and responsive classes**

In `IALegal.tsx`, add mobile tab state:

```typescript
const [mobileView, setMobileView] = useState<"results" | "doc" | "chat">("results");
```

Replace the main `<div className="flex flex-1 overflow-hidden">` with responsive logic:

```typescript
{/* Desktop: three columns */}
<div className="hidden lg:flex flex-1 overflow-hidden">
  <ResultsList ... />
  <DocumentViewer ... />
  <ChatSidebar ... />
</div>

{/* Mobile: tab switching */}
<div className="lg:hidden flex flex-col flex-1 overflow-hidden">
  <div className="flex border-b bg-card">
    {(["results", "doc", "chat"] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => setMobileView(tab)}
        className={`flex-1 py-2 text-xs font-medium transition-colors ${
          mobileView === tab ? "text-teal border-b-2 border-teal" : "text-muted-foreground"
        }`}
      >
        {tab === "results" ? "Resultados" : tab === "doc" ? "Documento" : "Chat"}
      </button>
    ))}
  </div>
  <div className="flex-1 overflow-hidden">
    {mobileView === "results" && <ResultsList ... className="w-full" />}
    {mobileView === "doc" && <DocumentViewer ... />}
    {mobileView === "chat" && <ChatSidebar ... className="w-full" />}
  </div>
</div>
```

Note: `ResultsList` and `ChatSidebar` have fixed widths (`w-[220px]`, `w-[240px]`). For mobile, the parent overrides with `w-full` via a className prop or wrapper div. Wrap each in `<div className="w-full h-full">` if needed.

- [ ] **Step 2: When user taps a result on mobile, switch to "doc" tab**

Update `handleSelectResult`:

```typescript
const handleSelectResult = useCallback((r: CorpusResult) => {
  setSelectedDoc(r);
  setHighlightedSection(null);
  setMobileView("doc"); // Auto-switch to document view on mobile
}, []);
```

- [ ] **Step 3: Verify build**

```bash
cd "C:/Users/NARO/Downloads/lexai-frontend-FINAL/lexai-copiloto-legal-6ecd87ac-main" && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/IALegal.tsx
git commit -m "feat(ia-legal): add responsive mobile layout with tab switching"
```

---

## P1 Exit Criteria Checklist

- [ ] SearchBar component renders with Cmd+K shortcut
- [ ] ResultsList shows Corpus/SPIJ tabs with search mode pills
- [ ] DocumentViewer renders selected document with keyword highlighting
- [ ] Chat link clicks scroll + highlight referenced sections in viewer
- [ ] ChatSidebar collapsible, with "Validar bibliografía" checkbox
- [ ] No mock data on initial load (empty states instead)
- [ ] Mobile responsive with tab switching
- [ ] All old AI modes removed (Consulta/Investigacion/Corpus tabs gone)
- [ ] "Verificar vigencia" removed entirely
- [ ] Build passes with no errors
