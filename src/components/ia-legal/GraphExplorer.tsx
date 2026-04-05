import { useState, useCallback, useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Maximize2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { GraphNode, GraphEdge, SubgraphResponse } from "@/lib/graph-types";
import { NODE_COLORS, type NodeLabel } from "@/lib/graph-types";

interface GraphExplorerProps {
  searchQuery: string;
  onNodeSelect: (node: GraphNode | null) => void;
  selectedNodeId: string | null;
}

interface ForceNode {
  id: string;
  label: NodeLabel;
  name: string;
  color: string;
  val: number;
  properties: Record<string, any>;
  x?: number;
  y?: number;
}

interface ForceLink {
  source: string | ForceNode;
  target: string | ForceNode;
  type: string;
  properties: Record<string, any>;
}

function toForceData(sub: SubgraphResponse) {
  const nodeMap = new Map<string, ForceNode>();

  for (const n of sub.nodes) {
    const props = n.properties || {};
    const name = props.doc_number || props.name || props.case_number || n.label;
    nodeMap.set(n.id, {
      id: n.id,
      label: n.label,
      name,
      color: NODE_COLORS[n.label] || "#6b7280",
      val: 1,
      properties: props,
    });
  }

  // Size nodes by connection count
  for (const e of sub.edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (src) src.val += 0.5;
    if (tgt) tgt.val += 0.5;
  }

  const links: ForceLink[] = sub.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      properties: e.properties || {},
    }));

  return { nodes: Array.from(nodeMap.values()), links };
}

export function GraphExplorer({ searchQuery, onNodeSelect, selectedNodeId }: GraphExplorerProps) {
  const [graphData, setGraphData] = useState<{ nodes: ForceNode[]; links: ForceLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const graphRef = useRef<any>(null);

  const loadSubgraph = useCallback(async (docNumber: string) => {
    setLoading(true);
    try {
      const data = await api<SubgraphResponse>("/api/graph/subgraph", {
        params: { doc_number: docNumber, depth: "2" },
      });
      if (data && data.nodes) {
        setGraphData(toForceData(data));
      }
    } catch (e) {
      console.error("[GraphExplorer] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(async (node: ForceNode) => {
    try {
      const keyProp = node.properties.doc_number || node.properties.name || node.properties.case_number;
      const data = await api<SubgraphResponse>("/api/graph/neighbors", {
        params: { node_id: keyProp, node_type: node.label },
      });
      if (data && data.nodes) {
        setGraphData((prev) => {
          const existingIds = new Set(prev.nodes.map((n) => n.id));
          const newForce = toForceData(data);
          const newNodes = newForce.nodes.filter((n) => !existingIds.has(n.id));
          const existingLinkKeys = new Set(prev.links.map((l) => {
            const srcId = typeof l.source === "object" ? (l.source as ForceNode).id : l.source;
            const tgtId = typeof l.target === "object" ? (l.target as ForceNode).id : l.target;
            return `${srcId}-${tgtId}`;
          }));
          const newLinks = newForce.links.filter((l) => {
            const srcId = typeof l.source === "object" ? (l.source as ForceNode).id : l.source;
            const tgtId = typeof l.target === "object" ? (l.target as ForceNode).id : l.target;
            return !existingLinkKeys.has(`${srcId}-${tgtId}`);
          });
          return {
            nodes: [...prev.nodes, ...newNodes],
            links: [...prev.links, ...newLinks],
          };
        });
      }
    } catch (e) {
      console.error("[GraphExplorer] expand error:", e);
    }
  }, []);

  // Load graph when search query contains a norm reference
  useEffect(() => {
    if (!searchQuery) return;
    const normMatch = searchQuery.match(/(Ley\s+\d+|D\.?\s*Leg\.?\s*\d+|D\.?S\.?\s*\d+[\-\d]*|RM\s+\d+)/i);
    if (normMatch) {
      loadSubgraph(normMatch[1]);
    }
  }, [searchQuery, loadSubgraph]);

  const handleNodeClick = useCallback((node: ForceNode) => {
    onNodeSelect({
      id: node.id,
      label: node.label,
      properties: node.properties,
    });
  }, [onNodeSelect]);

  const handleNodeDoubleClick = useCallback((node: ForceNode) => {
    expandNode(node);
  }, [expandNode]);

  const handleZoomToFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  if (graphData.nodes.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <p>Busca una norma para ver su grafo de relaciones</p>
          <p className="text-xs">Ej: "Ley 29230", "D.Leg. 1362"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-background">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <RefreshCw className="h-5 w-5 animate-spin text-teal" />
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-2 right-2 z-20 flex gap-1">
        <button
          onClick={handleZoomToFit}
          className="p-1.5 rounded bg-card border text-xs hover:bg-muted transition-colors"
          title="Ajustar vista"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-20 bg-card/90 border rounded p-2 text-[10px] space-y-1">
        {(Object.entries(NODE_COLORS) as [NodeLabel, string][]).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Hovered edge label */}
      {hoveredLink && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-card border rounded px-2 py-1 text-[10px] font-mono">
          {hoveredLink}
        </div>
      )}

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel={(n: any) => n.name}
        nodeColor={(n: any) => n.id === selectedNodeId ? "#0d9488" : n.color}
        nodeVal={(n: any) => n.val}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.name;
          const fontSize = Math.max(10 / globalScale, 3);
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = node.id === selectedNodeId ? "#0d9488" : node.color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.sqrt(node.val) * 4, 0, 2 * Math.PI);
          ctx.fill();

          if (globalScale > 0.8) {
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#e5e7eb";
            ctx.fillText(label, node.x, node.y + Math.sqrt(node.val) * 4 + 2);
          }
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.8}
        linkColor={() => "#4b5563"}
        linkWidth={1.5}
        onNodeClick={handleNodeClick}
        onNodeDblClick={handleNodeDoubleClick}
        onLinkHover={(link: any) => setHoveredLink(link ? link.type : null)}
        backgroundColor="transparent"
        cooldownTicks={100}
        onEngineStop={handleZoomToFit}
      />
    </div>
  );
}
