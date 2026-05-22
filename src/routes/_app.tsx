import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, ShoppingCart, Users, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: LucideIcon; masterOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Pedidos", icon: ShoppingCart },
  { to: "/comercial", label: "Comercial", icon: Users },
  { to: "/admin", label: "Admin", icon: Settings, masterOnly: true },
];

function AppLayout() {
  const { isAuthed, ready, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
        <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-baseline gap-3 shrink-0">
            <span className="font-serif italic text-2xl text-gradient-gold">Ravin</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hidden md:block">
              Central Comercial
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.filter((n) => !n.masterOnly || user?.role === "master").map((n) => {
              const active = location.pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "px-4 h-10 inline-flex items-center gap-2 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-accent/10 text-accent border border-accent/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user?.name} · {user?.role === "master" ? "Master" : "Vendedor"}
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

        {/* mobile nav */}
        <nav className="md:hidden border-t border-accent/10 flex">
          {NAV.filter((n) => !n.masterOnly || user?.role === "master").map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex-1 h-12 inline-flex items-center justify-center gap-2 text-xs",
                  active ? "text-accent" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
