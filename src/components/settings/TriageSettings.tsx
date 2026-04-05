import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, RotateCcw } from "lucide-react";
import type {
  EnrichedTriageContext,
  KeywordEntry,
  VipEntry,
  ArchiveRule,
} from "@/lib/triage-config";

interface TriageSettingsProps {
  context: EnrichedTriageContext | null;
  onSave: (configKey: string, entries: any[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Section 1: Remitentes VIP
// ---------------------------------------------------------------------------

function VipSection({
  entries,
  onSave,
}: {
  entries: VipEntry[];
  onSave: (entries: VipEntry[]) => Promise<void>;
}) {
  const [items, setItems] = useState<VipEntry[]>(entries);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const handleAdd = async () => {
    const email = newEmail.trim();
    if (!email) return;
    const updated = [...items, { email, label: newLabel.trim() || email }];
    setItems(updated);
    setNewEmail("");
    setNewLabel("");
    await onSave(updated);
  };

  const handleDelete = async (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    await onSave(updated);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay remitentes VIP configurados.</p>
      )}

      {items.map((v, i) => (
        <div
          key={`${v.email}-${i}`}
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{v.email}</p>
            {v.label && v.label !== v.email && (
              <p className="text-xs text-muted-foreground truncate">{v.label}</p>
            )}
          </div>
          <button
            onClick={() => handleDelete(i)}
            className="text-muted-foreground hover:text-danger transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Email o dominio"
          className="flex-1 text-sm"
        />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Etiqueta"
          className="w-32 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!newEmail.trim()}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Palabras clave por prioridad
// ---------------------------------------------------------------------------

function KeywordTier({
  label,
  tierColor,
  entries,
  onToggle,
}: {
  label: string;
  tierColor: string;
  entries: KeywordEntry[];
  onToggle: (index: number, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold ${tierColor}`}>{label}</p>
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin palabras clave.</p>
      )}
      {entries.map((kw, i) => (
        <div
          key={`${kw.keyword}-${i}`}
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`text-sm truncate ${!kw.enabled ? "line-through text-muted-foreground" : ""}`}>
              {kw.keyword}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {kw.weight}
            </Badge>
            {kw.tag !== "default" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                {kw.tag}
              </Badge>
            )}
          </div>
          <Switch
            checked={kw.enabled}
            onCheckedChange={(checked) => onToggle(i, checked)}
            className="shrink-0"
          />
        </div>
      ))}
    </div>
  );
}

function KeywordsSection({
  keywords,
  onSave,
  onResetDefaults,
}: {
  keywords: EnrichedTriageContext["userKeywords"];
  onSave: (tier: string, entries: KeywordEntry[]) => Promise<void>;
  onResetDefaults: () => Promise<void>;
}) {
  const [critical, setCritical] = useState<KeywordEntry[]>(keywords.critical);
  const [high, setHigh] = useState<KeywordEntry[]>(keywords.high);
  const [medium, setMedium] = useState<KeywordEntry[]>(keywords.medium);

  const toggleFactory =
    (tier: KeywordEntry[], setTier: (v: KeywordEntry[]) => void, configKey: string) =>
    async (index: number, enabled: boolean) => {
      const updated = tier.map((kw, i) => (i === index ? { ...kw, enabled } : kw));
      setTier(updated);
      await onSave(configKey, updated);
    };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["critical", "high", "medium"]}>
        <AccordionItem value="critical">
          <AccordionTrigger className="text-sm">Critico</AccordionTrigger>
          <AccordionContent>
            <KeywordTier
              label="Critico"
              tierColor="text-danger"
              entries={critical}
              onToggle={toggleFactory(critical, setCritical, "critical_keywords")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="high">
          <AccordionTrigger className="text-sm">Alto</AccordionTrigger>
          <AccordionContent>
            <KeywordTier
              label="Alto"
              tierColor="text-caution"
              entries={high}
              onToggle={toggleFactory(high, setHigh, "high_keywords")}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="medium">
          <AccordionTrigger className="text-sm">Medio</AccordionTrigger>
          <AccordionContent>
            <KeywordTier
              label="Medio"
              tierColor="text-gold"
              entries={medium}
              onToggle={toggleFactory(medium, setMedium, "medium_keywords")}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button
        variant="outline"
        size="sm"
        onClick={onResetDefaults}
        className="flex items-center gap-2"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restaurar predeterminados
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Reglas de auto-archivo
// ---------------------------------------------------------------------------

function ArchiveSection({
  rules,
  onSave,
}: {
  rules: ArchiveRule[];
  onSave: (entries: ArchiveRule[]) => Promise<void>;
}) {
  const [items, setItems] = useState<ArchiveRule[]>(rules);
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<"domain" | "pattern">("domain");

  const handleAdd = async () => {
    const pattern = newPattern.trim();
    if (!pattern) return;
    const updated = [...items, { pattern, type: newType }];
    setItems(updated);
    setNewPattern("");
    await onSave(updated);
  };

  const handleDelete = async (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    await onSave(updated);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay reglas de auto-archivo.</p>
      )}

      {items.map((r, i) => (
        <div
          key={`${r.pattern}-${i}`}
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-mono truncate">{r.pattern}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {r.type}
            </Badge>
          </div>
          <button
            onClick={() => handleDelete(i)}
            className="text-muted-foreground hover:text-danger transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          placeholder="Dominio o patron regex"
          className="flex-1 text-sm"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as "domain" | "pattern")}
          className="px-2 py-1 rounded-lg border bg-background text-sm outline-none"
        >
          <option value="domain">Dominio</option>
          <option value="pattern">Patron</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!newPattern.trim()}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TriageSettings({ context, onSave }: TriageSettingsProps) {
  if (!context) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Cargando configuracion de triage...
      </div>
    );
  }

  const handleResetDefaults = async () => {
    // Import dynamically to avoid circular deps issues at module level
    const { getDefaultKeywords } = await import("@/lib/triage-config");
    const defaults = getDefaultKeywords();
    await Promise.all([
      onSave("critical_keywords", defaults.critical),
      onSave("high_keywords", defaults.high),
      onSave("medium_keywords", defaults.medium),
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Remitentes VIP */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Remitentes VIP</h2>
        <p className="text-sm text-muted-foreground">
          Los correos de estos remitentes reciben prioridad automatica elevada.
        </p>
        <VipSection
          entries={
            context.vipSenders.map((email) => {
              // Reconstruct VipEntry from the flat vipSenders list
              const knownClient = context.knownClients.find((c) => c.email === email);
              return { email, label: knownClient?.name || email };
            })
          }
          onSave={(entries) => onSave("vip_senders", entries)}
        />
      </section>

      {/* Section 2: Palabras clave */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Palabras clave por prioridad</h2>
        <p className="text-sm text-muted-foreground">
          Activa o desactiva palabras clave que determinan la urgencia de cada correo.
        </p>
        <KeywordsSection
          keywords={context.userKeywords}
          onSave={(tier, entries) => onSave(tier, entries)}
          onResetDefaults={handleResetDefaults}
        />
      </section>

      {/* Section 3: Reglas de auto-archivo */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Reglas de auto-archivo</h2>
        <p className="text-sm text-muted-foreground">
          Correos que coincidan con estas reglas se archivan automaticamente.
        </p>
        <ArchiveSection
          rules={context.archiveRules}
          onSave={(entries) => onSave("archive_rules", entries)}
        />
      </section>
    </div>
  );
}
