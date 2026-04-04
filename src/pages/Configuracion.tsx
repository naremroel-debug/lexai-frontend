import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mockProfile } from "@/lib/mockData";
import { Mail, Calendar as CalIcon, HardDrive, Moon, Globe, CheckSquare } from "lucide-react";
import { TriageSettings } from "@/components/settings/TriageSettings";
import { useTriageContext } from "@/hooks/use-triage-context";
import { saveUserConfig } from "@/lib/triage-config";
import { useGmailEvents } from "@/hooks/use-gmail-events";
import { useMicrosoftEvents } from "@/hooks/use-microsoft-events";
import { supabase } from "@/lib/supabase";

export default function Configuracion() {
  const { user } = useAuth();
  const { context: triageCtx, refresh: refreshTriage } = useTriageContext();

  const [profileName, setProfileName] = useState(user?.name || mockProfile.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || mockProfile.email || "");
  const [profileRole, setProfileRole] = useState(user?.role || mockProfile.role || "");
  const [profileFirm, setProfileFirm] = useState(user?.firm || mockProfile.firm || "");
  const [saving, setSaving] = useState(false);
  const { isConnected: gmailConnected, connect: gmailConnect, disconnect: gmailDisconnect } = useGmailEvents();
  const { isConnected: msConnected, connect: msConnect, disconnect: msDisconnect } = useMicrosoftEvents();

  const handleTriageSave = async (configKey: string, entries: any[]) => {
    if (!user) return;
    await saveUserConfig(user.id, configKey, entries);
    refreshTriage();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-serif font-bold">Configuración</h1>

      {/* Integrations */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Integraciones</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {/* Gmail — wired to real connection state */}
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <span className="text-muted-foreground"><Mail className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-sm font-medium">Gmail</p>
              <p className={`text-xs ${gmailConnected ? "text-success" : "text-muted-foreground"}`}>
                {gmailConnected ? "Conectado" : "No conectado"}
              </p>
            </div>
            <button
              onClick={gmailConnected ? gmailDisconnect : gmailConnect}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                gmailConnected ? "bg-muted text-muted-foreground" : "bg-teal text-accent-foreground hover:bg-teal/90"
              }`}
            >
              {gmailConnected ? "Desconectar" : "Conectar"}
            </button>
          </div>
          {/* Google Calendar & Drive — share OAuth token with Gmail */}
          {[
            { icon: <CalIcon className="h-5 w-5" />, label: "Google Calendar" },
            { icon: <HardDrive className="h-5 w-5" />, label: "Google Drive" },
          ].map((i) => (
            <div key={i.label} className="flex items-center gap-3 p-3 rounded-lg border">
              <span className="text-muted-foreground">{i.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{i.label}</p>
                <p className={`text-xs ${gmailConnected ? "text-success" : "text-muted-foreground"}`}>
                  {gmailConnected ? "Conectado" : "No conectado"}
                </p>
              </div>
              <button
                onClick={gmailConnected ? gmailDisconnect : gmailConnect}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  gmailConnected ? "bg-muted text-muted-foreground" : "bg-teal text-accent-foreground hover:bg-teal/90"
                }`}
              >
                {gmailConnected ? "Desconectar" : "Conectar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Microsoft 365 */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Microsoft 365</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {/* Outlook */}
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <span className="text-muted-foreground"><Mail className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-sm font-medium">Outlook</p>
              <p className={`text-xs ${msConnected ? "text-success" : "text-muted-foreground"}`}>
                {msConnected ? "Conectado" : "No conectado"}
              </p>
            </div>
            <button
              onClick={msConnected ? msDisconnect : msConnect}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                msConnected ? "bg-muted text-muted-foreground" : "bg-teal text-accent-foreground hover:bg-teal/90"
              }`}
            >
              {msConnected ? "Desconectar" : "Conectar"}
            </button>
          </div>
          {/* Microsoft Calendar & To Do — connected when Outlook is connected */}
          {[
            { icon: <CalIcon className="h-5 w-5" />, label: "Microsoft Calendar" },
            { icon: <CheckSquare className="h-5 w-5" />, label: "Microsoft To Do" },
          ].map((i) => (
            <div key={i.label} className="flex items-center gap-3 p-3 rounded-lg border">
              <span className="text-muted-foreground">{i.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{i.label}</p>
                <p className={`text-xs ${msConnected ? "text-success" : "text-muted-foreground"}`}>
                  {msConnected ? "Conectado" : "No conectado"}
                </p>
              </div>
              <button
                onClick={msConnected ? msDisconnect : msConnect}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  msConnected ? "bg-muted text-muted-foreground" : "bg-teal text-accent-foreground hover:bg-teal/90"
                }`}
              >
                {msConnected ? "Desconectar" : "Conectar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Profile */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Perfil</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Nombre</label>
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Correo</label>
            <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Rol</label>
            <input value={profileRole} onChange={(e) => setProfileRole(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Firma</label>
            <input value={profileFirm} onChange={(e) => setProfileFirm(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
        </div>
        <button
          disabled={saving}
          onClick={async () => {
            if (!user?.id) return;
            setSaving(true);
            try {
              const { error } = await supabase
                .from("profiles")
                .upsert({
                  id: user.id,
                  full_name: profileName,
                  email: profileEmail,
                  role: profileRole,
                  firm: profileFirm,
                  updated_at: new Date().toISOString(),
                });
              if (error) throw error;
            } catch (err) {
              console.error("[Config] profile save error:", err);
            } finally {
              setSaving(false);
            }
          }}
          className="px-4 py-2 rounded-lg bg-teal text-accent-foreground text-sm font-medium hover:bg-teal/90 transition-colors disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </section>

      {/* Writing style */}
      <section className="bg-card rounded-xl border p-4">
        <h2 className="font-serif text-lg font-semibold mb-2">Estilo de escritura IA</h2>
        <p className="text-sm text-muted-foreground mb-3">Sube documentos de ejemplo para que la IA aprenda tu estilo de redacción.</p>
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm hover:border-teal/30 transition-colors cursor-pointer">
          Arrastra archivos aquí o haz clic para subir
        </div>
      </section>

      {/* Email triage settings */}
      <TriageSettings context={triageCtx} onSave={handleTriageSave} />

      {/* Appearance */}
      <section className="bg-card rounded-xl border p-4 space-y-3">
        <h2 className="font-serif text-lg font-semibold">Apariencia</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Moon className="h-4 w-4 text-muted-foreground" />
            Modo oscuro
          </div>
          <p className="text-xs text-muted-foreground">Usa el toggle en la barra superior</p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Idioma
          </div>
          <span className="text-sm">Español (Perú)</span>
        </div>
      </section>

      {/* Email signature */}
      <section className="bg-card rounded-xl border p-4">
        <h2 className="font-serif text-lg font-semibold mb-2">Firma de correo</h2>
        <textarea
          rows={4}
          defaultValue={`Dr. ${mockProfile.name}\n${mockProfile.role} — ${mockProfile.firm}\nLima, Perú`}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none resize-y"
        />
      </section>
    </div>
  );
}
