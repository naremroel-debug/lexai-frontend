import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { URGENCY_TO_ENGINE } from "@/components/shared/Chips";

interface UrgencyOverrideProps {
  emailId: string;
  currentUrgency: string;
  wasOverridden?: boolean;
  /** Called with ENGINE-format urgency: "critical" | "high" | "medium" | "low" */
  onOverride: (newUrgency: string, reason?: string) => void;
}

const urgencyOptions = [
  { value: "critical", label: "Crítico", style: "text-danger", dot: "bg-danger" },
  { value: "high", label: "Alto", style: "text-caution", dot: "bg-caution" },
  { value: "medium", label: "Medio", style: "text-gold", dot: "bg-gold" },
  { value: "low", label: "Bajo", style: "text-success", dot: "bg-success" },
] as const;

const chipStyles: Record<string, string> = {
  urgente: "bg-danger/10 text-danger border-danger/20",
  alta: "bg-caution/10 text-caution border-caution/20",
  media: "bg-gold/10 text-gold border-gold/20",
  baja: "bg-success/10 text-success border-success/20",
};

const chipLabels: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export function UrgencyOverride({
  emailId,
  currentUrgency,
  wasOverridden,
  onOverride,
}: UrgencyOverrideProps) {
  const [open, setOpen] = useState(false);
  // Normalize to engine format for radio group
  const normalizedUrgency = URGENCY_TO_ENGINE[currentUrgency] || currentUrgency;
  const [selected, setSelected] = useState(normalizedUrgency);
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onOverride(selected, reason || undefined);
    setOpen(false);
    setReason("");
  };

  const handleCancel = () => {
    setSelected(currentUrgency);
    setReason("");
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      // Reset to current values when opening (normalized to engine format)
      setSelected(URGENCY_TO_ENGINE[currentUrgency] || currentUrgency);
      setReason("");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${chipStyles[currentUrgency] || chipStyles.media}`}
        >
          {chipLabels[currentUrgency] || currentUrgency}
          {wasOverridden && (
            <Pencil className="h-3 w-3 opacity-60" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <p className="text-sm font-serif font-semibold">Cambiar urgencia</p>

          <RadioGroup value={selected} onValueChange={setSelected}>
            {urgencyOptions.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={`urgency-${emailId}-${opt.value}`} />
                <Label
                  htmlFor={`urgency-${emailId}-${opt.value}`}
                  className={`flex items-center gap-2 text-sm cursor-pointer ${opt.style}`}
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div>
            <Label htmlFor={`reason-${emailId}`} className="text-xs text-muted-foreground">
              Razon (opcional)
            </Label>
            <Input
              id={`reason-${emailId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Cliente VIP, plazo cercano..."
              className="mt-1 text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className="bg-teal text-accent-foreground hover:bg-teal/90"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
