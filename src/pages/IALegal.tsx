import { useState, useCallback } from "react";
import { mockChatMessages, mockCorpusResults } from "@/lib/mockData";
import { ToolBadge, ConfidenceBadge, SourceLink, CitationHealth, VerdictBadge } from "@/components/shared/Chips";
import { BrainIllustration, CorpusIllustration } from "@/components/shared/LexAIIcons";
import { Search, BookOpen, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { streamSSE, api, apiPost } from "@/lib/api";

type Mode = "consulta" | "busqueda" | "investigacion";

const modes = [
  { key: "consulta" as Mode, icon: "🧠", label: "Consulta", sub: "Claude Orchestra" },
  { key: "busqueda" as Mode, icon: "🔍", label: "Búsqueda Rápida", sub: "Gemini · 3s" },
  { key: "investigacion" as Mode, icon: "📚", label: "Investigación Profunda", sub: "Deep Research · Validador de fuentes" },
];

const quickActions = [
  { icon: "📝", label: "Generar Draft", sub: "Documento con marcadores [RIESGO]", accent: false },
  { icon: "⬆️", label: "Upload & Research", sub: "Sube brief → encuentra jurisprudencia", accent: true },
  { icon: "✅", label: "Verificar Vigencia", sub: "¿Está vigente esta norma?", accent: false },
];

const suggestedPrompts = [
  "Busca jurisprudencia sobre OxI en inversión pública",
  "¿Está vigente el Decreto Legislativo 1044?",
  "Genera un recurso de apelación para proceso CAS",
  "Calcula 15 días hábiles desde hoy",
];

export default function IALegal() {
  const { isDemo } = useAuth();
  const [mode, setMode] = useState<Mode>("consulta");
  const [messages, setMessages] = useState(mockChatMessages);
  const [input, setInput] = useState("");
  const [corpusQuery, setCQ] = useState("");
  const [corpusMode, setCM] = useState<"keyword" | "hybrid" | "semantic">("hybrid");
  const [mobileTab, setMobileTab] = useState<"chat" | "corpus">("chat");
  const [streaming, setStreaming] = useState(false);
  const [corpusResults, setCorpusResults] = useState(mockCorpusResults);
  const [searchingCorpus, setSearchingCorpus] = useState(false);

  const apiPath = mode === "busqueda" ? "/api/gemini-rag" : mode === "investigacion" ? "/api/deep-research" : "/api/claude-orchestra";

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { id: `msg_${Date.now()}`, role: "user" as const, content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    if (isDemo) return; // Demo mode: just shows the user message

    // Real mode: stream AI response
    setStreaming(true);
    const aiMsg = { id: `ai_${Date.now()}`, role: "assistant" as const, content: "", tools: [] as string[], confidence: "", sources: [] as any[], timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, aiMsg]);

    try {
      let fullContent = "";
      for await (const chunk of streamSSE(apiPath, { message: input, mode })) {
        try {
          const parsed = JSON.parse(chunk);
          if (parsed.token) { fullContent += parsed.token; }
          else if (parsed.content) { fullContent = parsed.content; }
          else if (parsed.tools) { aiMsg.tools = parsed.tools; }
          else if (parsed.confidence) { aiMsg.confidence = parsed.confidence; }
          else if (parsed.sources) { aiMsg.sources = parsed.sources; }
          else { fullContent += chunk; }
        } catch { fullContent += chunk; }
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...aiMsg, content: fullContent } : m));
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...aiMsg, content: `⚠ Error: ${e.message}. Intenta de nuevo.` } : m));
    } finally { setStreaming(false); }
  }, [input, streaming, isDemo, apiPath, mode]);

  const handleCorpusSearch = useCallback(async () => {
    if (!corpusQuery.trim()) return;
    if (isDemo) return;
    setSearchingCorpus(true);
    try {
      const results = await api<any[]>("/api/corpus/search", { params: { q: corpusQuery, mode: corpusMode, limit: "20" } });
      setCorpusResults(results || []);
    } catch { /* keep mock results */ }
    finally { setSearchingCorpus(false); }
  }, [corpusQuery, corpusMode, isDemo]);

  const handleQuickAction = (label: string) => {
    if (label === "Verificar Vigencia") {
      setInput("Verifica si el Decreto Legislativo 1252 está vigente");
    }
  };

  return (
    <div className="space-y-4 animate-fade-in -mx-4 lg:-mx-6 -my-6 px-4 lg:px-6 py-6 min-h-[calc(100vh-8rem)]">
      {/* Mode selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 border ${
              mode === m.key ? "bg-teal text-accent-foreground border-teal shadow-sm" : "bg-card border-border hover:border-teal/30 hover:scale-[1.02]"
            }`}
          >
            <span>{m.icon}</span> {m.label}
            <span className={`text-xs ${mode === m.key ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{m.sub}</span>
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        {quickActions.map((a, idx) => (
          <button
            key={a.label}
            onClick={() => handleQuickAction(a.label)}
            style={{ animationDelay: `${idx * 60}ms` }}
            className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-all duration-200 hover:border-teal/30 hover:scale-[1.02] hover:shadow-sm animate-slide-up ${
              a.accent ? "border-teal/40 bg-teal/5" : "bg-card"
            }`}
          >
            <span className="text-xl shrink-0">{a.icon}</span>
            <div className="min-w-0">
              <div className="font-medium text-sm">{a.label}</div>
              <div className="text-xs text-muted-foreground truncate">{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Mobile tab toggle */}
      <div className="lg:hidden flex gap-2">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${mobileTab === "chat" ? "bg-teal text-accent-foreground" : "bg-card border"}`}
        >
          Chat IA
        </button>
        <button
          onClick={() => setMobileTab("corpus")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${mobileTab === "corpus" ? "bg-teal text-accent-foreground" : "bg-card border"}`}
        >
          Corpus
        </button>
      </div>

      {/* Split pane */}
      <div className="flex gap-4 flex-1" style={{ minHeight: "60vh" }}>
        <div className={`flex-[3] flex flex-col ${mobileTab !== "chat" ? "hidden lg:flex" : "flex"}`}>
          <ChatPanel messages={messages} input={input} setInput={setInput} onSend={handleSend} mode={mode} streaming={streaming} />
        </div>
        <div className={`flex-[2] flex flex-col ${mobileTab !== "corpus" ? "hidden lg:flex" : "flex"}`}>
          <CorpusPanel query={corpusQuery} setQuery={setCQ} mode={corpusMode} setMode={setCM} results={corpusResults} onSearch={handleCorpusSearch} searching={searchingCorpus} />
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ messages, input, setInput, onSend, mode, streaming }: {
  messages: typeof mockChatMessages; input: string; setInput: (s: string) => void; onSend: () => void; mode: Mode; streaming?: boolean;
}) {
  const isEmpty = messages.length === 0;
  const modeLabels: Record<Mode, string> = { consulta: "Claude Orchestra", busqueda: "Gemini", investigacion: "Deep Research + Validador de bibliografía" };

  return (
    <div className="flex flex-col bg-card rounded-xl border overflow-hidden flex-1">
      {/* AI banner */}
      <div className="bg-ai-bg dark:bg-navy-light/50 px-4 py-2 text-xs flex items-center justify-between border-b">
        <span>✨ Generado por IA — verificar antes de usar</span>
        <span className="text-muted-foreground">{modeLabels[mode]}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-enter">
            <BrainIllustration className="w-24 h-24 mb-4 animate-float" />
            <h2 className="font-serif text-xl font-bold mb-2">
              {mode === "investigacion" ? "Investigación Profunda" : mode === "busqueda" ? "Búsqueda Rápida" : "Consulta IA Legal"}
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              {mode === "investigacion" 
                ? "Investigación exhaustiva con validación automática de bibliografía y enlaces citados"
                : mode === "busqueda"
                ? "Búsqueda rápida con Gemini — resultados en ~3 segundos"
                : "Pregunta sobre normas, jurisprudencia, o genera documentos"}
            </p>
            {mode === "investigacion" && (
              <div className="flex items-center gap-1.5 text-xs text-teal bg-teal/5 px-3 py-1.5 rounded-full mb-4">
                <span>🔗</span>
                <span className="font-medium">Cada fuente citada se verifica contra SPIJ, El Peruano y bases oficiales</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
              {suggestedPrompts.map((p, idx) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  style={{ animationDelay: `${idx * 80}ms` }}
                  className="text-left text-sm p-3 rounded-lg border hover:border-teal/30 hover:bg-teal/5 transition-all duration-200 hover:scale-[1.02] animate-slide-up"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`} style={{ animationDelay: `${idx * 50}ms` }}>
              <div className={`max-w-[85%] rounded-xl px-4 py-3 transition-all duration-200 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-ai-bg dark:bg-navy-light border rounded-bl-sm"
              }`}>
                {msg.role === "assistant" ? (
                  <AssistantMessage msg={msg} />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Escribe tu consulta legal..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm outline-none resize-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200"
          />
          <button onClick={onSend} className="px-4 py-2 rounded-lg bg-teal text-accent-foreground hover:bg-teal/90 transition-all duration-200 active:scale-95">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">LexAI puede cometer errores. Verifica la información.</p>
      </div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: (typeof mockChatMessages)[number] }) {
  const isVerification = "confidence" in msg && msg.content.includes("VIGENTE");

  return (
    <div className="space-y-3">
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />

      {isVerification && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/20 animate-scale-in">
          <VerdictBadge verdict="VIGENTE" />
          <ConfidenceBadge level="alto" />
        </div>
      )}

      {"tools" in msg && msg.tools && (
        <>
          <hr className="border-border" />
          <div className="flex flex-wrap gap-1.5">
            {msg.tools.map((t: string) => <ToolBadge key={t} name={t} />)}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {"confidence" in msg && !isVerification && <ConfidenceBadge level={msg.confidence as any} />}
            {"citation_verified" in msg && <CitationHealth verified={msg.citation_verified as number} total={msg.citation_total as number} />}
          </div>
          {"sources" in msg && (
            <div className="space-y-1">
              {(msg.sources as any[]).map((s: any, i: number) => (
                <SourceLink key={i} {...s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CorpusPanel({ query, setQuery, mode, setMode, results, onSearch, searching }: {
  query: string; setQuery: (s: string) => void;
  mode: "keyword" | "hybrid" | "semantic"; setMode: (m: any) => void;
  results: any[]; onSearch: () => void; searching: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border flex flex-col flex-1 overflow-hidden">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Corpus Legal
          </h3>
          <span className="text-xs font-mono text-muted-foreground">598 docs</span>
        </div>
        <div className="flex gap-1 mb-3">
          {(["keyword", "hybrid", "semantic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                mode === m ? "bg-teal text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en corpus..."
            className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200"
          />
          <button className="px-3 py-2 rounded-lg bg-teal text-accent-foreground hover:bg-teal/90 transition-all duration-200 active:scale-95">
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {results.map((r, idx) => (
          <div key={r.id} className="border rounded-lg p-3 hover:border-teal/30 transition-all duration-200 cursor-pointer hover:shadow-sm animate-slide-up" style={{ animationDelay: `${idx * 60}ms` }}>
            <h4 className="text-sm font-medium mb-1">{r.title}</h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span className="font-mono">{r.doc_number}</span>
              <span>·</span>
              <span>{r.date}</span>
              <span className="px-1.5 py-0.5 rounded bg-teal/10 text-teal text-xs">{r.source}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-teal rounded-full transition-all duration-500" style={{ width: `${r.relevance}%` }} />
              </div>
              <span className="text-xs font-mono text-teal">{r.relevance}%</span>
            </div>
            <p className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: r.snippet }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="font-serif font-bold text-base mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-serif font-bold text-lg mt-4 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-teal pl-3 italic text-muted-foreground text-sm">$1</blockquote>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
