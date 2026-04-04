import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mockStats, mockTasks, mockEmails, mockSuggestions, mockNews } from "@/lib/mockData";
import { StatCard, UrgencyChip, HeatBadge } from "@/components/shared/Chips";
import { CheckSquare, Mail, Clock, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApiData } from "@/hooks/use-api-data";
import { LoadingCards, ErrorBanner } from "@/components/shared/DataStates";

export default function Dashboard() {
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();

  // API connections — fallback to mock in demo mode
  const { data: dashData, loading, error, refetch } = useApiData<any>({
    path: "/api/dashboard", mockData: { stats: mockStats, tasks: mockTasks, recentEmails: mockEmails, suggestions: mockSuggestions }
  });
  const { data: suggestions, refetch: refetchSuggestions } = useApiData<any[]>({ path: "/api/suggestions", mockData: mockSuggestions });
  const { data: newsData } = useApiData<any[]>({ path: "/api/news", mockData: mockNews });

  // Try AI-generated suggestions via Tauri when Supabase suggestions are empty
  const aiSuggestionsTriedRef = useRef(false);
  useEffect(() => {
    if (isDemo || aiSuggestionsTriedRef.current) return;
    if (suggestions && suggestions.length === 0) {
      aiSuggestionsTriedRef.current = true;
      (async () => {
        try {
          if (typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)) {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("generate_suggestions");
            // After Tauri generates and stores suggestions, refetch from Supabase
            refetchSuggestions();
          }
        } catch (err) {
          // Tauri not available or Gemini failed — existing Supabase suggestions still show
          console.debug("[Index] generate_suggestions unavailable:", err);
        }
      })();
    }
  }, [isDemo, suggestions, refetchSuggestions]);

  const stats = dashData?.stats || mockStats;
  const tasks = dashData?.tasks || mockTasks;
  const emails = dashData?.recentEmails || mockEmails;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const loadColor = stats.load_index < 3 ? "text-success" : stats.load_index <= 4 ? "text-gold" : "text-danger";
  const wellnessDot = stats.load_index < 3 ? "bg-success" : stats.load_index <= 4 ? "bg-gold" : "bg-danger";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="bg-primary rounded-xl p-6 text-primary-foreground">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2.5 h-2.5 rounded-full ${wellnessDot}`} />
          <span className="text-primary-foreground/70 text-sm">
            {new Date().toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-serif font-bold">{greeting}, {user?.name?.split(" ").pop()}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Tareas pendientes" value={stats.pending_tasks} icon={<CheckSquare className="h-5 w-5" />} />
        <StatCard label="Correos sin leer" value={stats.unread_emails} icon={<Mail className="h-5 w-5" />} />
        <StatCard label="Horas esta semana" value={`${stats.hours_this_week}h`} icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Índice de carga" value={stats.load_index} icon={<Activity className="h-5 w-5" />} accent={loadColor} />
      </div>

      {/* Suggestions */}
      <section>
        <h2 className="text-lg font-serif font-semibold mb-3">Sugerencias proactivas</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {suggestions.map((s) => (
            <div key={s.id} className="bg-card rounded-lg border p-4 hover:border-teal/30 transition-colors">
              <div className="text-2xl mb-2">{s.emoji}</div>
              <h3 className="font-medium text-sm mb-1">{s.question}</h3>
              <p className="text-xs text-muted-foreground mb-3">{s.detail}</p>
              <button className="text-xs font-medium text-teal hover:underline">{s.action} →</button>
            </div>
          ))}
        </div>
      </section>

      {/* Two columns */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent emails */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-serif font-semibold">Correos recientes</h2>
            <button onClick={() => navigate("/correos")} className="text-xs text-teal hover:underline">Ver todos →</button>
          </div>
          <div className="space-y-2">
            {emails.slice(0, 3).map((e) => (
              <div key={e.id} className="bg-card rounded-lg border p-3 hover:border-teal/30 transition-colors cursor-pointer" onClick={() => navigate("/correos")}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate flex-1">{e.subject}</span>
                  <UrgencyChip level={e.urgency} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{e.summary}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pending tasks */}
        <section>
          <h2 className="text-lg font-serif font-semibold mb-3">Tareas pendientes</h2>
          <div className="space-y-2">
            {tasks.slice(0, 5).map((t) => (
              <div key={t.id} className="bg-card rounded-lg border p-3 hover:border-teal/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm">{t.title}</span>
                  <UrgencyChip level={t.priority} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Fecha límite: {new Date(t.deadline).toLocaleDateString("es-PE")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* News widget */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-serif font-semibold">📰 Últimas normas</h2>
          <button onClick={() => navigate("/noticias")} className="text-xs text-teal hover:underline">Ver boletín completo →</button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {(newsData || mockNews).slice(0, 3).map((n) => (
            <div key={n.id} className="bg-card rounded-lg border p-3 hover:border-teal/30 transition-colors cursor-pointer" onClick={() => navigate("/noticias")}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-medium line-clamp-2">{n.title}</h3>
                <HeatBadge heat={n.heat} />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{n.summary}</p>
              {n.affected_case && (
                <p className="text-xs text-caution mt-1">⚡ Afecta: {n.affected_case}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
