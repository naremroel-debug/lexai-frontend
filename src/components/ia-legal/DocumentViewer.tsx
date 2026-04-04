import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";

interface CorpusResult {
  id: string;
  title: string;
  doc_number: string;
  date: string;
  source: string;
  relevance: number;
  snippet: string;
  content?: string;
}

interface DocumentViewerProps {
  document: CorpusResult | null;
  searchQuery: string;
  highlightedSection: string | null;
}

export function DocumentViewer({ document, searchQuery, highlightedSection }: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);

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
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-teal shrink-0" />
          <h2 className="font-serif font-semibold text-sm truncate">{document.title}</h2>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {document.date} · {document.source} · {document.doc_number}
        </div>
      </div>

      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {document.content ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlightContent(document.content, searchQuery, highlightedSection) }}
          />
        ) : (
          <div className="space-y-3">
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

  if (query.trim()) {
    const words = query.trim().split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      const regex = new RegExp(`(${escapeRegex(word)})`, "gi");
      result = result.replace(regex, '<mark class="bg-teal/20 text-teal rounded px-0.5">$1</mark>');
    }
  }

  if (section) {
    const sectionRegex = new RegExp(`(<strong>[^<]*${escapeRegex(section)}[^<]*</strong>)`, "gi");
    result = result.replace(
      sectionRegex,
      `<div data-section="${section}" class="border-l-[3px] border-teal bg-teal/5 pl-3 py-2 -ml-3 rounded-r">$1</div>`
    );
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
