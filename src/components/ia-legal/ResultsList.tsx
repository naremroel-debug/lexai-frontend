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
