import { useAuth } from "@/contexts/AuthContext";

interface UrgencyChipProps {
  level: "urgente" | "alta" | "media" | "baja";
  className?: string;
}

const chipStyles = {
  urgente: "bg-danger/10 text-danger border-danger/20",
  alta: "bg-caution/10 text-caution border-caution/20",
  media: "bg-gold/10 text-gold border-gold/20",
  baja: "bg-success/10 text-success border-success/20",
};

const chipLabels = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export function UrgencyChip({ level, className = "" }: UrgencyChipProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${chipStyles[level]} ${className}`}>
      {chipLabels[level]}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
}

export function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border p-4 hover:border-teal/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className={accent || "text-muted-foreground"}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold font-serif ${accent || "text-foreground"}`}>{value}</p>
    </div>
  );
}

interface ConfidenceBadgeProps {
  level: string;
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const styles = {
    alto: { bg: "bg-success/10 text-success", icon: "🛡", label: "ALTO" },
    medio: { bg: "bg-caution/10 text-caution", icon: "⚠️", label: "MEDIO" },
    bajo: { bg: "bg-danger/10 text-danger", icon: "🔴", label: "BAJO" },
  };
  const key = (level || "medio").toLowerCase() as keyof typeof styles;
  const s = styles[key] || styles.medio;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg}`}>
      {s.icon} {s.label}
    </span>
  );
}

export function ToolBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-teal/10 text-teal">
      {name}
    </span>
  );
}

interface SourceLinkProps {
  title: string;
  domain: string;
  url: string;
  verified: boolean;
}

export function SourceLink({ title, domain, url, verified }: SourceLinkProps) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:underline text-muted-foreground hover:text-foreground transition-colors">
      <span>{verified ? "🟢" : "🟡"}</span>
      <span className="truncate">{title}</span>
      <span className="text-xs text-ink-secondary">({domain})</span>
    </a>
  );
}

export function CitationHealth({ verified, total }: { verified: number; total: number }) {
  const color = verified === total ? "text-success" : verified > 0 ? "text-caution" : "text-danger";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      📖 {verified}/{total} citas verificadas
    </span>
  );
}

interface VerdictBadgeProps {
  verdict: "VIGENTE" | "DEROGADA" | "MODIFICADA" | "INCONCLUSO";
}

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const styles = {
    VIGENTE: "bg-success/10 text-success border-success/30",
    DEROGADA: "bg-danger/10 text-danger border-danger/30",
    MODIFICADA: "bg-caution/10 text-caution border-caution/30",
    INCONCLUSO: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold border-2 ${styles[verdict]}`}>
      {verdict}
    </span>
  );
}

export function DemoBanner() {
  const { isDemo } = useAuth();
  if (!isDemo) return null;
  return (
    <div className="bg-caution/10 border-b border-caution/20 px-4 py-2 text-center text-sm text-caution font-medium">
      🟡 Modo Demo — datos de ejemplo
    </div>
  );
}

export function LexaiLoader() {
  return (
    <div className="flex items-center justify-center gap-1 py-8">
      <div className="w-2 h-2 rounded-full bg-teal animate-pulse-dot" style={{ animationDelay: "0s" }} />
      <div className="w-2 h-2 rounded-full bg-teal animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
      <div className="w-2 h-2 rounded-full bg-teal animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}

export function StatusChip({ status }: { status: "activo" | "urgente" | "pendiente" | "resuelto" }) {
  const styles = {
    activo: "bg-teal/10 text-teal border-teal/20",
    urgente: "bg-danger/10 text-danger border-danger/20",
    pendiente: "bg-caution/10 text-caution border-caution/20",
    resuelto: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function HeatBadge({ heat }: { heat: string }) {
  const icons: Record<string, string> = { alta: "🔴", media: "🟡", baja: "🔵" };
  return <span className="text-sm">{icons[heat] || "🔵"}</span>;
}

export function JournalTypeBadge({ type }: { type: "nota" | "tarea" }) {
  const styles = {
    nota: "bg-muted text-muted-foreground",
    tarea: "bg-caution/10 text-caution",
  };
  const labels = { nota: "Nota", tarea: "Tarea" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}
