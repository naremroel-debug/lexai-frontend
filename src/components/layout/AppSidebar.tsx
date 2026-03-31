import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { LexAIFavicon } from "@/components/shared/LexAIIcons";
import {
  LayoutDashboard, Brain, Briefcase, Mail, Calendar, Newspaper, Settings,
  ChevronLeft, ChevronRight, LogOut, Star
} from "lucide-react";

const navItems = [
  { path: "/", label: "Inicio", icon: LayoutDashboard },
  { path: "/ia-legal", label: "IA Legal", icon: Brain, star: true },
  { path: "/casos", label: "Casos Activos", icon: Briefcase },
  { path: "/correos", label: "Correos", icon: Mail },
  { path: "/calendario", label: "Calendario", icon: Calendar },
  { path: "/noticias", label: "Noticias", icon: Newspaper },
  { path: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <aside className={`hidden lg:flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out ${collapsed ? "w-16" : "w-60"} min-h-screen`}>
      <div className={`flex items-center gap-2 p-4 border-b border-sidebar-border transition-all duration-300 ${collapsed ? "justify-center" : ""}`}>
        <LexAIFavicon className="w-7 h-7 shrink-0" />
        {!collapsed && (
          <span className="font-serif text-xl font-bold text-sidebar-primary animate-fade-in">LexAI</span>
        )}
      </div>

      <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
        {navItems.map((item, idx) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{ animationDelay: `${idx * 30}ms` }}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:translate-x-0.5"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="flex items-center gap-1">
                  {item.label}
                  {item.star && <Star className="h-3 w-3 text-gold fill-gold" />}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={logout}
          className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent transition-all duration-200 ${collapsed ? "justify-center px-2" : ""}`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-all duration-200"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
