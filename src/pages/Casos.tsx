import { useState, useEffect } from "react";
import { mockCases, mockJournalEntries } from "@/lib/mockData";
import { StatusChip, JournalTypeBadge } from "@/components/shared/Chips";
import { ArrowLeft, Upload, FileText, Search, Plus } from "lucide-react";
import { useApiData } from "@/hooks/use-api-data";
import { apiPost, apiDelete } from "@/lib/api";

export default function Casos() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumen" | "journal" | "documentos">("resumen");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [searchQ, setSearchQ] = useState("");

  const { data: cases, refetch: refetchCases } = useApiData<any[]>({ path: "/api/cases", mockData: mockCases });
  const { data: journalAll } = useApiData<any[]>({ path: "/api/client-journal", params: selectedId ? { case_id: selectedId } : undefined, mockData: mockJournalEntries, enabled: !!selectedId });

  const selected = cases.find((c: any) => c.id === selectedId);
  const entries = journalAll.filter((j: any) => j.case_id === selectedId);

  const filteredCases = cases.filter((c: any) => {
    const matchesStatus = statusFilter === "todos" || c.status === statusFilter;
    const matchesSearch = searchQ === "" || c.project_name.toLowerCase().includes(searchQ.toLowerCase()) || c.client_name.toLowerCase().includes(searchQ.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (selected) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => { setSelectedId(null); setTab("resumen"); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a casos
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold">{selected.project_name}</h1>
            <p className="text-sm text-muted-foreground">{selected.client_name}</p>
          </div>
          <StatusChip status={selected.status} />
        </div>

        <div className="flex gap-2 border-b">
          {(["resumen", "journal", "documentos"] as const).map((t) => {
            const labels = { resumen: "Resumen", journal: "Journal", documentos: "Documentos" };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-teal text-teal" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {tab === "resumen" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-card rounded-lg border p-4">
              <span className="text-xs text-muted-foreground">Cliente</span>
              <p className="font-medium text-sm">{selected.client_name}</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <span className="text-xs text-muted-foreground">Área legal</span>
              <p className="font-medium text-sm">{selected.area_legal}</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <span className="text-xs text-muted-foreground">Estado</span>
              <div className="mt-1"><StatusChip status={selected.status} /></div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <span className="text-xs text-muted-foreground">Creado</span>
              <p className="font-medium text-sm">{new Date(selected.created).toLocaleDateString("es-PE")}</p>
            </div>
          </div>
        )}

        {tab === "journal" && (
          <div className="space-y-3">
            {/* Add entry form */}
            <div className="bg-card rounded-lg border p-4 space-y-2">
              <textarea placeholder="Nueva entrada de journal..." rows={2} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none resize-none focus:ring-2 focus:ring-teal/50" />
              <div className="flex items-center gap-2">
                <select className="px-2 py-1.5 rounded border bg-background text-xs outline-none">
                  <option>Nota</option>
                  <option>Tarea</option>
                </select>
                <button className="px-3 py-1.5 rounded bg-teal text-accent-foreground text-xs font-medium hover:bg-teal/90 transition-colors">Agregar</button>
              </div>
            </div>
            {entries.map((j) => (
              <div key={j.id} className="bg-card rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <JournalTypeBadge type={j.type} />
                  <span className="text-xs text-muted-foreground">{new Date(j.date).toLocaleDateString("es-PE")}</span>
                </div>
                <p className="text-sm">{j.content}</p>
                <p className="text-xs text-muted-foreground mt-1">— {j.author}</p>
              </div>
            ))}
            {entries.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin entradas de journal.</p>}
          </div>
        )}

        {tab === "documentos" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm hover:border-teal/30 transition-colors cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Arrastra archivos aquí o haz clic para subir
            </div>
            {/* Mock documents */}
            <div className="space-y-2">
              {[
                { name: "Expediente_Técnico_OxI.pdf", size: "2.4 MB", date: "2026-03-15" },
                { name: "Observaciones_DGPPIP.pdf", size: "845 KB", date: "2026-03-30" },
                { name: "Convenio_de_Inversión.docx", size: "1.1 MB", date: "2025-12-20" },
              ].map((doc) => (
                <div key={doc.name} className="bg-card rounded-lg border p-3 flex items-center gap-3 hover:border-teal/30 transition-colors">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.size} · {new Date(doc.date).toLocaleDateString("es-PE")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-serif font-bold">Casos Activos</h1>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-card rounded-lg border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar casos..."
            className="bg-transparent outline-none text-sm flex-1"
          />
        </div>
        <div className="flex gap-1">
          {["todos", "activo", "urgente", "pendiente"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                statusFilter === s ? "bg-teal text-accent-foreground border-teal" : "bg-card border-border hover:border-teal/30"
              }`}
            >
              {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredCases.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="bg-card rounded-lg border p-4 cursor-pointer hover:border-teal/30 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-sm">{c.project_name}</h3>
              <StatusChip status={c.status} />
            </div>
            <p className="text-xs text-muted-foreground mb-2">{c.client_name}</p>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{c.area_legal}</span>
          </div>
        ))}
        {filteredCases.length === 0 && (
          <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
            No se encontraron casos.
          </div>
        )}
      </div>
    </div>
  );
}
