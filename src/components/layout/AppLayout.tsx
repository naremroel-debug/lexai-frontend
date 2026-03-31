import { ReactNode, useState, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { DemoBanner } from "@/components/shared/Chips";
import { LexAIFavicon, AvatarNarem } from "@/components/shared/LexAIIcons";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Sun, Moon, Shield } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <DemoBanner />
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border transition-all duration-300">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14">
            {/* Mobile logo */}
            <div className="flex items-center gap-2 lg:hidden">
              <LexAIFavicon className="w-7 h-7" />
              <span className="font-serif text-lg font-bold text-teal">LexAI</span>
            </div>

            {/* Search */}
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
              <div className="flex items-center gap-2 w-full bg-muted rounded-lg px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-teal/30">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar... (Cmd+K)"
                  className="bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-teal/10 text-teal border border-teal/20">
                <Shield className="h-3 w-3" /> Verificado IA
              </span>
              <button
                onClick={() => setDark(!dark)}
                className="p-2 rounded-lg hover:bg-muted transition-all duration-200 hover:scale-105"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <AvatarNarem className="w-8 h-8 text-xs" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
