import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LexAIFavicon } from "@/components/shared/LexAIIcons";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, enableDemo } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    enableDemo();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-enter">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal/10 mb-4 animate-float">
            <LexAIFavicon className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground">LexAI</h1>
          <p className="text-muted-foreground mt-1">Copiloto Legal</p>
        </div>

        <div className="bg-card rounded-xl border p-6 shadow-sm animate-slide-up" style={{ animationDelay: "100ms" }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-teal/50 transition-shadow duration-200"
                placeholder="abogado@firma.pe"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-teal/50 pr-10 transition-shadow duration-200"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-teal text-accent-foreground font-medium text-sm hover:bg-teal/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50">
              {loading ? "Verificando..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">o</span></div>
          </div>

          <button
            onClick={handleDemo}
            className="w-full py-3 rounded-lg border-2 border-teal bg-teal/5 text-teal font-semibold text-sm hover:bg-teal/10 transition-all duration-200 active:scale-[0.98]"
          >
            🚀 Entrar sin cuenta (demo)
          </button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Explora todas las funciones con datos de ejemplo
          </p>
        </div>
      </div>
    </div>
  );
}
