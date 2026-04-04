import { useState, useCallback } from "react";
import { mockCorpusResults } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { api, apiPost } from "@/lib/api";

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

  // Mobile state
  const [mobileView, setMobileView] = useState<"results" | "doc" | "chat">("results");

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
        const data = await apiPost("/api/spij/chat", {
          messages: [{ role: "user", content: query }],
        });
        const raw = data?.data ?? data;
        const spijResults: CorpusResult[] = (raw?.sources || []).map((s: any, i: number) => ({
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
    setMobileView("doc"); // Auto-switch on mobile
  }, []);

  // Chat references an article → highlight in viewer
  const handleArticleClick = useCallback((ref: string) => {
    setHighlightedSection(ref);
    setMobileView("doc"); // Show doc on mobile when chat link clicked
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
        <DocumentViewer
          document={selectedDoc}
          searchQuery={query}
          highlightedSection={highlightedSection}
        />
        <ChatSidebar
          messages={messages}
          onMessagesChange={setMessages}
          documentContext={docContext}
          onArticleClick={handleArticleClick}
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
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
