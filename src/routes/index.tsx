import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { isAuthed, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!ready) return;
    navigate({ to: isAuthed ? "/dashboard" : "/login", replace: true });
  }, [isAuthed, ready, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-12 w-12 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
    </div>
  );
}
