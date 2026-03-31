import { useState } from "react";
import { mockEmails } from "@/lib/mockData";
import { UrgencyChip } from "@/components/shared/Chips";
import { Mail, RefreshCw, Pen, ArrowLeft, X, Loader2 } from "lucide-react";
import { useApiData } from "@/hooks/use-api-data";
import { apiPost } from "@/lib/api";
import { LoadingSpinner, ErrorBanner } from "@/components/shared/DataStates";

export default function Correos() {
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: emails, loading, error, refetch } = useApiData<any[]>({ path: "/api/emails", mockData: mockEmails });
  const email = emails.find((e: any) => e.id === selected);

  const handleSync = async () => {
    setSyncing(true);
    try { await apiPost("/api/emails", {}); refetch(); } catch {} finally { setSyncing(false); }
  };

  if (composing) {
    return (
      <div className="animate-fade-in space-y-4">
        <button onClick={() => setComposing(false)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" /> Cancelar
        </button>
        <div className="bg-card rounded-xl border p-6 space-y-4 animate-scale-in">
          <h2 className="font-serif text-xl font-bold">Nuevo correo</h2>
          <input placeholder="Para:" className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200" />
          <input placeholder="CC:" className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200" />
          <input placeholder="Asunto:" className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200" />
          <textarea rows={8} placeholder="Escribe tu mensaje..." className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none resize-y focus:ring-2 focus:ring-teal/50 transition-shadow duration-200" />
          <div className="flex gap-2">
            <button className="px-6 py-2 rounded-lg bg-teal text-accent-foreground font-medium text-sm hover:bg-teal/90 transition-all duration-200 active:scale-[0.98]">Enviar</button>
            <button className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">🤖 Redactar con IA</button>
          </div>
        </div>
      </div>
    );
  }

  if (email) {
    return (
      <div className="animate-fade-in space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card rounded-xl border p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-serif text-xl font-bold">{email.subject}</h2>
              <UrgencyChip level={email.urgency} />
            </div>
            <p className="text-sm text-muted-foreground mb-1">{email.from}</p>
            <p className="text-xs text-muted-foreground mb-4">{new Date(email.date).toLocaleString("es-PE")}</p>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{email.body}</div>
            <button className="mt-4 px-4 py-2 rounded-lg bg-teal/10 text-teal text-sm font-medium hover:bg-teal/20 transition-colors">
              🤖 Generar respuesta IA
            </button>
          </div>
          <div className="bg-ai-bg dark:bg-card rounded-xl border p-4">
            <h3 className="font-serif font-semibold text-sm mb-3">Análisis IA</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{email.ai_analysis.type}</span></div>
              <div><span className="text-muted-foreground">Urgencia:</span> <UrgencyChip level={email.ai_analysis.urgency as any} /></div>
              <div><span className="text-muted-foreground">Fecha límite:</span> <span className="font-medium">{email.ai_analysis.deadline ? new Date(email.ai_analysis.deadline).toLocaleDateString("es-PE") : "—"}</span></div>
              <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{email.ai_analysis.client || "—"}</span></div>
              <div><span className="text-muted-foreground">Proyecto:</span> <span className="font-medium">{email.ai_analysis.project || "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">Correos</h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">
            <RefreshCw className="h-4 w-4" /> Sincronizar Gmail
          </button>
        </div>
      </div>

      <input placeholder="Buscar correos..." className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-teal/50" />

      <div className="space-y-2">
        {emails.map((e) => (
          <div
            key={e.id}
            onClick={() => setSelected(e.id)}
            className={`bg-card rounded-lg border p-4 cursor-pointer hover:border-teal/30 transition-colors ${!e.read ? "border-l-2 border-l-teal" : ""}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className={`text-sm ${!e.read ? "font-semibold" : ""} truncate flex-1`}>{e.subject}</span>
              <UrgencyChip level={e.urgency} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{e.from}</span>
              <span>{new Date(e.date).toLocaleDateString("es-PE")}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{e.summary}</p>
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setComposing(true)}
        className="fixed right-6 bottom-24 lg:bottom-6 w-14 h-14 rounded-full bg-teal text-accent-foreground shadow-lg hover:bg-teal/90 transition-colors flex items-center justify-center"
      >
        <Pen className="h-5 w-5" />
      </button>
    </div>
  );
}
