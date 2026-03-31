import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mockStats, mockTasks, mockEmails, mockSuggestions, mockTimeEntries, mockNews } from "@/lib/mockData";
import { StatCard, UrgencyChip, HeatBadge } from "@/components/shared/Chips";
import { CheckSquare, Mail, Clock, Activity, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApiData } from "@/hooks/use-api-data";
import { apiPost, apiDelete } from "@/lib/api";
import { LoadingCards, ErrorBanner } from "@/components/shared/DataStates";

const projects = ["GR Cusco OxI", "Quellaveco EIA", "TSRA Apelación", "Graña Montero Arbitraje", "Miraflores APP", "Interno"];

export default function Dashboard() {
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [timeOpen, setTimeOpen] = useState(false);
  const [project, setProject] = useState(projects[0]);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");

  // API connections — fallback to mock in demo mode
  const { data: dashData, loading, error, refetch } = useApiData<any>({
    path: "/api/dashboard", mockData: { stats: mockStats, tasks: mockTasks, recentEmails: mockEmails, suggestions: mockSuggestions }
  });
  const { data: timeData } = useApiData<any[]>({ path: "/api/time-entries", params: { days: "30" }, mockData: mockTimeEntries });

  const stats = dashData?.stats || mockStats;
  const tasks = dashData?.tasks || mockTasks;
  const emails = dashData?.recentEmails || mockEmails;
  const suggestions = dashData?.suggestions || mockSuggestions;
  const [entries, setEntries] = useState(mockTimeEntries);
  useEffect(() => { if (timeData) setEntries(timeData); }, [timeData]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const loadColor = stats.load_index < 3 ? "text-success" : stats.load_index <= 4 ? "text-gold" : "text-danger";
  const wellnessDot = stats.load_index < 3 ? "bg-success" : stats.load_index <= 4 ? "bg-gold" : "bg-danger";

  const todayHours = entries.filter((e) => e.date === new Date().toISOString().split("T")[0]).reduce((s, e) => s + e.hours, 0);

  const handleRegister = async () => {
    if (!hours) return;
    const entry = { project, hours: parseFloat(hours), date: new Date().toISOString().split("T")[0], notes };
    if (!isDemo) {
      try { await apiPost("/api/time-entries", entry); } catch {}
    }
    setEntries([{ id: `te_${Date.now()}`, ...entry }, ...entries]);
    setHours(""); setNotes("");
  };

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
        {/* Expandable hours card */}
        <div className="bg-card rounded-lg border hover:border-teal/30 transition-colors">
          <button onClick={() => setTimeOpen(!timeOpen)} className="w-full p-4 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground text-sm">Horas esta semana</span>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-5 w-5" />
                {timeOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </div>
            <p className="text-2xl font-bold font-serif">{stats.hours_this_week}h</p>
          </button>
          {timeOpen && (
            <div className="px-4 pb-4 space-y-3 border-t pt-3 animate-fade-in">
              <div className="text-center">
                <span className="text-xs text-muted-foreground">Hoy: </span>
                <span className="text-sm font-bold text-teal">{todayHours}h</span>
              </div>
              <div className="flex gap-2">
                <select value={project} onChange={(e) => setProject(e.target.value)} className="flex-1 px-2 py-1.5 rounded border bg-background text-xs outline-none">
                  {projects.map((p) => <option key={p}>{p}</option>)}
                </select>
                <input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hrs" className="w-14 px-2 py-1.5 rounded border bg-background text-xs outline-none" />
              </div>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas..." className="w-full px-2 py-1.5 rounded border bg-background text-xs outline-none" />
              <button onClick={handleRegister} className="w-full py-1.5 rounded bg-teal text-accent-foreground text-xs font-medium hover:bg-teal/90 transition-colors">
                Registrar
              </button>
              {entries.slice(0, 3).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1 text-muted-foreground">{e.project}</span>
                  <span className="font-mono text-teal ml-2">{e.hours}h</span>
                  <button onClick={() => setEntries(entries.filter((x) => x.id !== e.id))} className="ml-1 text-danger/50 hover:text-danger">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
          {mockNews.slice(0, 3).map((n) => (
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
