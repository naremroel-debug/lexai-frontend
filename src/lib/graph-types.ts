export type NodeLabel =
  | "Norm" | "Institution" | "LegalConcept"
  | "JudicialJurisprudence" | "AdministrativeInterpretation"
  | "GeographicEntity" | "Procedure";

export type EdgeType =
  | "CITES" | "MODIFIES" | "REPEALS" | "SUPERSEDES" | "HAS_VERSION"
  | "ADMINISTERED_BY" | "DEFINES"
  | "INTERPRETS" | "ESTABLISHES_PRECEDENT" | "OPINES_ON" | "ISSUED_BY"
  | "APPLIES_IN" | "LOCATED_IN"
  | "REGULATED_BY" | "EXECUTED_BY" | "HAS_STEP";

export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  properties: Record<string, any>;
}

export interface SubgraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStatsResponse {
  nodes: Record<NodeLabel, number>;
  edges: Record<EdgeType, number>;
  total_nodes: number;
  total_edges: number;
}

export interface GraphRagResponse {
  answer: string;
  citations: Array<{ doc_number: string; title: string; article?: string }>;
  graph_context: SubgraphResponse;
  temporal_notes: string[];
}

export const NODE_COLORS: Record<NodeLabel, string> = {
  Norm: "#3b82f6",
  Institution: "#22c55e",
  LegalConcept: "#f97316",
  JudicialJurisprudence: "#8b5cf6",
  AdministrativeInterpretation: "#a78bfa",
  GeographicEntity: "#6b7280",
  Procedure: "#14b8a6",
};
