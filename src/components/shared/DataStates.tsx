import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-muted rounded-lg" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 bg-muted rounded-xl" />
      ))}
    </div>
  );
}

export function LoadingSpinner({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 text-teal animate-spin mr-2" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-sm text-red-700 dark:text-red-300">{message}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1 text-xs font-medium text-teal hover:underline">
          <RefreshCw className="h-3 w-3" /> Reintentar
        </button>
      )}
    </div>
  );
}

export function DemoBadge() {
  return (
    <div className="text-center py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
      <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">🟡 Modo Demo — datos de ejemplo</span>
    </div>
  );
}
