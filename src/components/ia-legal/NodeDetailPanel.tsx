import { X, ExternalLink, ArrowRight } from "lucide-react";
import type { GraphNode, NodeLabel } from "@/lib/graph-types";
import { NODE_COLORS } from "@/lib/graph-types";

interface NodeDetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
  onViewInCorpus: (docNumber: string) => void;
  onExpandNeighbors: (node: GraphNode) => void;
}

const LABEL_DISPLAY: Record<NodeLabel, string> = {
  Norm: "Norma",
  Institution: "Institucion",
  LegalConcept: "Concepto Legal",
  JudicialJurisprudence: "Jurisprudencia Judicial",
  AdministrativeInterpretation: "Interpretacion Administrativa",
  GeographicEntity: "Entidad Geografica",
  Procedure: "Procedimiento",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  vigente: { label: "Vigente", className: "bg-green-500/20 text-green-400" },
  derogado: { label: "Derogado", className: "bg-red-500/20 text-red-400" },
  modificado: { label: "Modificado", className: "bg-yellow-500/20 text-yellow-400" },
};

function NormDetail({ props, onViewInCorpus }: { props: Record<string, any>; onViewInCorpus: (d: string) => void }) {
  const status = STATUS_BADGE[props.status] || STATUS_BADGE.vigente;
  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{props.title || props.doc_number}</div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{props.doc_number}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>
      {props.year && <div className="text-xs text-muted-foreground">Ano: {props.year}</div>}
      {props.full_text_preview && (
        <p className="text-xs text-muted-foreground line-clamp-4">{props.full_text_preview}</p>
      )}
      {props.doc_number && (
        <button
          onClick={() => onViewInCorpus(props.doc_number)}
          className="flex items-center gap-1 text-xs text-teal hover:text-teal/80 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Ver en Corpus
        </button>
      )}
    </div>
  );
}

function JurisprudenceDetail({ props }: { props: Record<string, any> }) {
  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{props.case_number || props.doc_number}</div>
      <div className="flex items-center gap-2">
        {props.tribunal && <span className="text-xs text-muted-foreground">{props.tribunal}</span>}
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          props.binding ? "bg-purple-500/20 text-purple-400" : "bg-muted text-muted-foreground"
        }`}>
          {props.binding ? "Vinculante" : "No vinculante"}
        </span>
      </div>
      {(props.ruling_summary || props.summary) && (
        <p className="text-xs text-muted-foreground line-clamp-6">{props.ruling_summary || props.summary}</p>
      )}
    </div>
  );
}

function GenericDetail({ props }: { props: Record<string, any> }) {
  const name = props.name || props.doc_number || props.case_number || "—";
  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{name}</div>
      {Object.entries(props)
        .filter(([k]) => !["name", "doc_number", "case_number"].includes(k))
        .map(([key, val]) => (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{key}: </span>
            <span>{String(val)}</span>
          </div>
        ))}
    </div>
  );
}

export function NodeDetailPanel({ node, onClose, onViewInCorpus, onExpandNeighbors }: NodeDetailPanelProps) {
  if (!node) return null;

  const color = NODE_COLORS[node.label] || "#6b7280";

  return (
    <div className="w-[240px] shrink-0 flex flex-col bg-card border-l animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs font-semibold">{LABEL_DISPLAY[node.label] || node.label}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {node.label === "Norm" && <NormDetail props={node.properties} onViewInCorpus={onViewInCorpus} />}
        {(node.label === "JudicialJurisprudence" || node.label === "AdministrativeInterpretation") && (
          <JurisprudenceDetail props={node.properties} />
        )}
        {!["Norm", "JudicialJurisprudence", "AdministrativeInterpretation"].includes(node.label) && (
          <GenericDetail props={node.properties} />
        )}
      </div>

      {/* Actions */}
      <div className="p-2 border-t">
        <button
          onClick={() => onExpandNeighbors(node)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-muted text-xs hover:bg-muted/80 transition-colors"
        >
          <ArrowRight className="h-3 w-3" /> Expandir vecinos
        </button>
      </div>
    </div>
  );
}
