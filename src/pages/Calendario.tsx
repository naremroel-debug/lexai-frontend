import { mockCalendarEvents, PERU_HOLIDAYS_2026 } from "@/lib/mockData";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Calculator } from "lucide-react";

const EVENT_STYLES: Record<string, string> = {
  danger: "bg-red-100 border-l-red-500 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  teal: "bg-teal-50 border-l-teal-500 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  caution: "bg-amber-50 border-l-amber-500 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  muted: "bg-gray-50 border-l-gray-400 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
};

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 - 18:00

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isHoliday(s: string) { return PERU_HOLIDAYS_2026.includes(s); }

function calcBusinessDays(start: string, n: number): Date {
  const d = new Date(start + "T12:00:00");
  let rem = n;
  while (rem > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(toDateStr(d))) rem--;
  }
  return d;
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

export default function Calendario() {
  const [bdStart, setBdStart] = useState("2026-03-31");
  const [bdDays, setBdDays] = useState("15");
  const [bdResult, setBdResult] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const base = getWeekStart(today);
  const weekStart = new Date(base);
  weekStart.setDate(base.getDate() + weekOffset * 7);

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const weekLabel = `${days[0].getDate()} ${days[0].toLocaleDateString("es-PE",{month:"short"})} — ${days[4].getDate()} ${days[4].toLocaleDateString("es-PE",{month:"short",year:"numeric"})}`;

  const handleCalc = () => {
    if (!bdStart) return;
    setBdResult(calcBusinessDays(bdStart, parseInt(bdDays)||0).toLocaleDateString("es-PE",{weekday:"long",year:"numeric",month:"long",day:"numeric"}));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold">Calendario</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWeekOffset(w=>w-1)} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="h-4 w-4"/></button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal/90 transition-colors">Hoy</button>
          <button onClick={() => setWeekOffset(w=>w+1)} className="p-2 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="h-4 w-4"/></button>
          <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{weekLabel}</span>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            {/* Day headers */}
            <thead>
              <tr className="border-b">
                <th className="w-[56px] p-2"/>
                {days.map((d, i) => {
                  const ds = toDateStr(d);
                  const isToday = d.toDateString() === today.toDateString();
                  const holiday = isHoliday(ds);
                  return (
                    <th key={i} className={`p-2 text-center border-l font-normal ${isToday ? "bg-teal/10" : holiday ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {d.toLocaleDateString("es-PE",{weekday:"short"})}
                      </div>
                      <div className={`text-lg font-semibold ${isToday ? "text-teal" : holiday ? "text-red-500" : "text-foreground"}`}>
                        {d.getDate()}
                      </div>
                      {holiday && <div className="text-[9px] text-red-500 font-medium">Feriado</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {/* Hour rows */}
            <tbody>
              {HOURS.map(h => (
                <tr key={h} className="border-b last:border-0">
                  <td className="p-1 pr-2 text-right align-top">
                    <span className="text-[10px] text-muted-foreground font-mono">{`${h}:00`}</span>
                  </td>
                  {days.map((d, di) => {
                    const ds = toDateStr(d);
                    const evts = mockCalendarEvents.filter(e => e.date === ds && parseInt(e.start.split(":")[0]) === h);
                    return (
                      <td key={di} className="border-l p-0.5 h-[52px] align-top relative group hover:bg-teal/[0.03] transition-colors">
                        {evts.map(ev => (
                          <div key={ev.id} className={`rounded-md border-l-[3px] px-2 py-1 text-[11px] leading-tight cursor-pointer hover:shadow-sm transition-shadow ${EVENT_STYLES[ev.color] || EVENT_STYLES.muted}`}>
                            <div className="font-semibold truncate">{ev.title}</div>
                            <div className="opacity-70 text-[10px]">{ev.start}–{ev.end}</div>
                          </div>
                        ))}
                        {evts.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-40 transition-opacity">
                            <Plus className="h-3 w-3 text-muted-foreground"/>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Business Days Calculator */}
      <div className="bg-card rounded-xl border p-5">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="h-4 w-4 text-teal"/>
          <h2 className="font-serif text-base font-semibold">Calculadora de Plazos</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">Días hábiles en Perú — excluye fines de semana y feriados nacionales 2026. Resultado 100% confiable (matemática pura, sin IA).</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Fecha inicio</label>
            <input type="date" value={bdStart} onChange={e => setBdStart(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm focus:ring-2 focus:ring-teal/40 outline-none transition-shadow"/>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Días hábiles</label>
            <input type="number" value={bdDays} onChange={e => setBdDays(e.target.value)} min="1"
              className="px-3 py-2 rounded-lg border bg-background text-sm w-20 focus:ring-2 focus:ring-teal/40 outline-none transition-shadow"/>
          </div>
          <button onClick={handleCalc} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal/90 transition-colors">
            Calcular
          </button>
        </div>
        {bdResult && (
          <div className="mt-4 p-3 rounded-lg bg-teal/5 border border-teal/20">
            <p className="text-[11px] text-muted-foreground">Fecha resultado:</p>
            <p className="text-lg font-serif font-bold text-teal">{bdResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
