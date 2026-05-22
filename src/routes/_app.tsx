import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthed, ready, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !isAuthed) navigate({ to: "/login", replace: true });
  }, [ready, isAuthed, navigate]);

  if (!ready || !isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-accent/10 backdrop-blur-md bg-background/60 sticky top-0 z-30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-baseline gap-3">
            <span className="font-serif italic text-2xl text-gradient-gold">Ravin</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Gestor de Pedidos
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              Denis · RAVIN
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate({ to: "/login", replace: true });
              }}
              className="text-muted-foreground hover:text-accent"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
