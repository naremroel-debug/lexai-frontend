import { NavLink } from "react-router-dom";
import { LayoutDashboard, Brain, Briefcase, Calendar, Menu, Mail, Newspaper, Settings, X, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const mainTabs = [
  { path: "/", label: "Inicio", icon: LayoutDashboard },
  { path: "/ia-legal", label: "IA Legal", icon: Brain },
  { path: "/casos", label: "Casos", icon: Briefcase },
  { path: "/calendario", label: "Calendario", icon: Calendar },
];

const moreTabs = [
  { path: "/correos", label: "Correos", icon: Mail },
  { path: "/noticias", label: "Noticias", icon: Newspaper },
  { path: "/configuracion", label: "Configuración", icon: Settings },
];

export function MobileNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border backdrop-blur">
        <div className="flex items-center justify-around py-2">
          {mainTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-all duration-200 min-w-[48px] min-h-[48px] justify-center ${
                  isActive ? "text-teal scale-110" : "text-muted-foreground"
                }`
              }
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-muted-foreground min-w-[48px] min-h-[48px] justify-center transition-all duration-200 active:scale-95"
          >
            <Menu className="h-5 w-5" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-foreground/50 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-card border-l border-border p-4 animate-slide-in-right">
            <div className="flex items-center justify-between mb-6">
              <span className="font-serif text-lg font-bold">Más opciones</span>
              <button onClick={() => setDrawerOpen(false)} className="hover:bg-muted p-1 rounded transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {moreTabs.map((tab, idx) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                onClick={() => setDrawerOpen(false)}
                style={{ animationDelay: `${idx * 50}ms` }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 animate-slide-up ${
                    isActive ? "bg-teal/10 text-teal" : "text-foreground hover:bg-muted"
                  }`
                }
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </NavLink>
            ))}
            <button
              onClick={() => { logout(); setDrawerOpen(false); }}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-danger hover:bg-danger/10 w-full mt-4 transition-all duration-200"
            >
              <LogOut className="h-5 w-5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
