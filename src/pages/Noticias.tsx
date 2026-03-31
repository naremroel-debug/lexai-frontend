import { mockNews } from "@/lib/mockData";
import { HeatBadge } from "@/components/shared/Chips";
import { useState } from "react";
import { useApiData } from "@/hooks/use-api-data";
import { apiPost } from "@/lib/api";

const tabs = ["Todas", "Relevantes para mis casos", "Tributario", "Administrativo", "Civil"];

export default function Noticias() {
  const [activeTab, setActiveTab] = useState("Todas");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const { data: news, loading } = useApiData<any[]>({ path: "/api/news", mockData: mockNews });

  const filtered = activeTab === "Todas"
    ? news
    : activeTab === "Relevantes para mis casos"
    ? news.filter((n) => n.affected_case)
    : news.filter((n) => n.category === activeTab);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-serif font-bold">📰 Boletín Legal IA</h1>
        <p className="text-sm text-muted-foreground mt-1">Normas que impactan tu práctica — curado por IA</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
              activeTab === t ? "bg-teal text-accent-foreground border-teal" : "bg-card border-border hover:border-teal/30"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Action button */}
      <div className="flex justify-end">
        <button className="px-4 py-2 rounded-lg bg-teal/10 text-teal text-sm font-medium hover:bg-teal/20 transition-colors">
          🤖 Generar resumen semanal
        </button>
      </div>

      {/* Articles */}
      <div className="space-y-3">
        {filtered.map((n) => (
          <div key={n.id} className="bg-card rounded-xl border p-5 hover:border-teal/30 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-serif text-lg font-semibold">{n.title}</h2>
              <HeatBadge heat={n.heat} />
            </div>
            <p className="text-sm text-muted-foreground mb-3">{n.summary}</p>

            {n.affected_case && (
              <div className="mb-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-caution/10 text-caution text-xs font-medium border border-caution/20">
                ⚡ Afecta: {n.affected_case}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-muted">{n.source}</span>
                <span>·</span>
                <span>{new Date(n.date).toLocaleDateString("es-PE")}</span>
                <span>·</span>
                <span>{n.category}</span>
              </div>
              <button className="text-xs font-medium text-teal hover:underline">Analizar impacto →</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No hay artículos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}
