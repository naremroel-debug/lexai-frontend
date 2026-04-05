import { useState, useCallback } from "react";
import { Network } from "lucide-react";
import { mockCorpusResults } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { api, apiPost } from "@/lib/api";

import { SearchBar } from "@/components/ia-legal/SearchBar";
import { ResultsList, type CorpusResult, type SearchSource, type CorpusMode } from "@/components/ia-legal/ResultsList";
import { DocumentViewer } from "@/components/ia-legal/DocumentViewer";
import { ChatSidebar, type ChatMessage } from "@/components/ia-legal/ChatSidebar";
import { GraphExplorer } from "@/components/ia-legal/GraphExplorer";
import { NodeDetailPanel } from "@/components/ia-legal/NodeDetailPanel";
import type { GraphNode } from "@/lib/graph-types";

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

  // Mobile state
  const [mobileView, setMobileView] = useState<"results" | "doc" | "chat">("results");

  // Graph state
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphNode | null>(null);
  const [useGraphCtx, setUseGraphCtx] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

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
        // SPIJ: stream Gemini response with Google Search grounding into center panel
        const spijDoc: CorpusResult = {
          id: "spij_live",
          title: `SPIJ — ${query}`,
          doc_number: "",
          date: new Date().toISOString().slice(0, 10),
          source: "SPIJ (Gemini + Google Search)",
          relevance: 100,
          snippet: "",
          content: "Buscando en fuentes legales peruanas...",
        };
        setSelectedDoc(spijDoc);
        setResults([]);

        try {
          const token = (await (await import("@/lib/supabase")).supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch("https://lexai-omega.vercel.app/api/spij/chat", {
            method: "POST",
            headers: { Authorization: `Bearer ${token || ""}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: query }] }),
          });

          if (!res.ok) throw new Error(`SPIJ error ${res.status}`);
          const reader = res.body!.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let fullText = "";
          const sources: CorpusResult[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const ev = JSON.parse(line.slice(6).trim());
                if (ev.type === "text") {
                  fullText += ev.content;
                  setSelectedDoc(prev => prev ? { ...prev, content: fullText } : prev);
                } else if (ev.type === "sources") {
                  const mapped = (ev.sources || []).map((s: any, i: number) => ({
                    id: `spij_src_${i}`,
                    title: s.title || "Fuente SPIJ",
                    doc_number: "",
                    date: "",
                    source: "SPIJ",
                    relevance: 95 - i * 3,
                    snippet: "",
                    content: "",
                  }));
                  sources.push(...mapped);
                  setResults(sources);
                }
              } catch { /* partial JSON */ }
            }
          }
        } catch (e: any) {
          setSelectedDoc(prev => prev ? { ...prev, content: `⚠ Error: ${e.message}` } : prev);
        }
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
    setMobileView("doc"); // Auto-switch on mobile
  }, []);

  // Chat references an article → highlight in viewer
  const handleArticleClick = useCallback((ref: string) => {
    setHighlightedSection(ref);
    setMobileView("doc"); // Show doc on mobile when chat link clicked
  }, []);

  // Graph: view a norm in corpus search results
  const handleViewInCorpus = useCallback((docNumber: string) => {
    setQuery(docNumber);
    setSource("corpus");
  }, []);

  // Graph: expand node neighbors (handled by GraphExplorer internally via double-click)
  const handleExpandNeighbors = useCallback((_node: GraphNode) => {}, []);

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

      {/* Desktop: three columns */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
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
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Graph toggle button */}
          {source === "corpus" && (
            <button
              onClick={() => { setShowGraph(!showGraph); if (!showGraph) setSelectedGraphNode(null); }}
              className={`absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                showGraph
                  ? "bg-teal text-accent-foreground border-teal"
                  : "bg-card text-muted-foreground border-border hover:border-teal hover:text-teal"
              }`}
              title={showGraph ? "Ver documento" : "Ver grafo de relaciones"}
            >
              <Network className="h-3 w-3" />
              {showGraph ? "Documento" : "Grafo"}
            </button>
          )}

          {showGraph && source === "corpus" ? (
            <div className="flex flex-1 overflow-hidden">
              <GraphExplorer
                searchQuery={query}
                onNodeSelect={setSelectedGraphNode}
                selectedNodeId={selectedGraphNode?.id || null}
              />
              {selectedGraphNode && (
                <NodeDetailPanel
                  node={selectedGraphNode}
                  onClose={() => setSelectedGraphNode(null)}
                  onViewInCorpus={handleViewInCorpus}
                  onExpandNeighbors={handleExpandNeighbors}
                />
              )}
            </div>
          ) : (
            <DocumentViewer
              document={selectedDoc}
              searchQuery={query}
              highlightedSection={highlightedSection}
            />
          )}
        </div>
        <ChatSidebar
          messages={messages}
          onMessagesChange={setMessages}
          documentContext={docContext}
          onArticleClick={handleArticleClick}
          useGraphContext={useGraphCtx}
          onGraphContextChange={setUseGraphCtx}
        />
      </div>

      {/* Mobile: tab switching */}
      <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
        <div className="flex border-b bg-card shrink-0">
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
        <div className="flex-1 overflow-hidden flex">
          {mobileView === "results" && (
            <div className="w-full">
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
            </div>
          )}
          {mobileView === "doc" && (
            <DocumentViewer
              document={selectedDoc}
              searchQuery={query}
              highlightedSection={highlightedSection}
            />
          )}
          {mobileView === "chat" && (
            <div className="w-full">
              <ChatSidebar
                messages={messages}
                onMessagesChange={setMessages}
                documentContext={docContext}
                onArticleClick={handleArticleClick}
                useGraphContext={useGraphCtx}
                onGraphContextChange={setUseGraphCtx}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
