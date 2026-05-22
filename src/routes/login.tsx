import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "RAVIN · Acesso" }] }),
  component: Login,
});

function Login() {
  const { login, isAuthed, ready } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"boot" | "ready">("boot");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && isAuthed) navigate({ to: "/dashboard", replace: true });
  }, [ready, isAuthed, navigate]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase("ready");
      setTimeout(() => inputRef.current?.focus(), 300);
    }, 2200);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(code);
    if (ok) {
      toast.success("Bem-vindo, Denis.");
      navigate({ to: "/dashboard", replace: true });
    } else {
      toast.error("Credencial inválida.");
      setCode("");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4">
      {/* Jarvis orb */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[520px] w-[520px] max-w-[90vw] max-h-[90vw]">
          <div className="absolute inset-0 rounded-full border border-accent/20 animate-scan-ring" />
          <div className="absolute inset-6 rounded-full border border-accent/10 animate-scan-ring-reverse" />
          <div className="absolute inset-16 rounded-full border border-accent/15 animate-scan-ring" style={{ animationDuration: "8s" }} />
          <div className="absolute inset-32 rounded-full bg-gradient-wine opacity-40 blur-3xl animate-pulse-glow" />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {phase === "boot" ? (
          <div className="text-center space-y-6">
            <div className="font-serif text-6xl italic text-gradient-gold animate-fade-up" style={{ animationDelay: "0.1s" }}>
              Ravin
            </div>
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground animate-fade-up" style={{ animationDelay: "0.6s" }}>
              Inicializando sistema
            </div>
            <div className="flex justify-center gap-1.5 animate-fade-up" style={{ animationDelay: "1s" }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="glass rounded-2xl p-8 space-y-6 shadow-wine animate-fade-up">
            <div className="text-center space-y-2">
              <div className="font-serif text-4xl italic text-gradient-gold">Ravin</div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                Vinho do seu jeito
              </p>
            </div>
            <div className="border-t border-accent/10" />
            <div className="space-y-2 text-center">
              <p className="text-sm text-muted-foreground">
                Olá, <span className="text-accent">Denis</span>. Informe sua credencial de acesso.
              </p>
            </div>
            <div className="space-y-3">
              <Input
                ref={inputRef}
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••••"
                className="h-14 text-center text-lg tracking-[0.3em] bg-background/40 border-accent/20 focus-visible:ring-accent"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={loading || !code}
                className="w-full h-12 bg-gradient-wine hover:opacity-90 text-foreground font-medium tracking-wide border border-accent/30"
              >
                {loading ? "Verificando…" : "Acessar"}
              </Button>
            </div>
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
              Sistema privado · RAVIN
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
