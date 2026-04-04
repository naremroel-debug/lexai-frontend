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
  onArticleClick: (articleRef: string) => void;
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

function ChatContent({ content, onArticleClick }: { content: string; onArticleClick: (ref: string) => void }) {
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
