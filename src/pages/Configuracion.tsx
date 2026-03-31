import { useAuth } from "@/contexts/AuthContext";
import { mockProfile } from "@/lib/mockData";
import { Mail, Calendar as CalIcon, HardDrive, Moon, Globe } from "lucide-react";

export default function Configuracion() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-serif font-bold">Configuración</h1>

      {/* Integrations */}
      <section className="bg-card rounded-xl border p-4 space-y-4">
        <h2 className="font-serif text-lg font-semibold">Integraciones</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: <Mail className="h-5 w-5" />, label: "Gmail", status: "Conectado", connected: true },
            { icon: <CalIcon className="h-5 w-5" />, label: "Google Calendar", status: "No conectado", connected: false },
            { icon: <HardDrive className="h-5 w-5" />, label: "Google Drive", status: "No conectado", connected: false },
          ].map((i) => (
            <div key={i.label} className="flex items-center gap-3 p-3 rounded-lg border">
              <span className="text-muted-foreground">{i.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{i.label}</p>
                <p className={`text-xs ${i.connected ? "text-success" : "text-muted-foreground"}`}>{i.status}</p>
              </div>
              <button className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                i.connected ? "bg-muted text-muted-foreground" : "bg-teal text-accent-foreground hover:bg-teal/90"
              }`}>
                {i.connected ? "Desconectar" : "Conectar"}
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
            <input defaultValue={user?.name || mockProfile.name} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Correo</label>
            <input defaultValue={user?.email || mockProfile.email} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Rol</label>
            <input defaultValue={mockProfile.role} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Firma</label>
            <input defaultValue={mockProfile.firm} className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none" />
          </div>
        </div>
        <button className="px-4 py-2 rounded-lg bg-teal text-accent-foreground text-sm font-medium hover:bg-teal/90 transition-colors">
          Guardar cambios
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
