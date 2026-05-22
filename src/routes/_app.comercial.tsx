import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listLeads, upsertLead, updateLeadStatus, deleteLead, listTasks, completeTask } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, MessageCircle, Phone, AlertCircle, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/comercial")({
  head: () => ({ meta: [{ title: "RAVIN · Comercial" }] }),
  component: ComercialPage,
});

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  status: "novo" | "qualificado" | "proposta" | "negociacao" | "fechado" | "perdido";
  next_followup_at: string | null;
  last_interaction_at: string | null;
  unread_count: number;
  origin: string;
};

const COLUMNS: { id: Lead["status"]; label: string }[] = [
  { id: "novo", label: "Novo" },
  { id: "qualificado", label: "Qualificado" },
  { id: "proposta", label: "Proposta" },
  { id: "negociacao", label: "Negociação" },
  { id: "fechado", label: "Fechado" },
  { id: "perdido", label: "Perdido" },
];

function ComercialPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [creating, setCreating] = useState<Partial<Lead> | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [l, t] = await Promise.all([listLeads(), listTasks()]);
      setLeads(l as Lead[]);
      setTasks(t);
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { refresh(); }, []);

  // Realtime: refresh when leads or messages change
  useEffect(() => {
    const ch = supabase
      .channel("comercial")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Lead[]> = {};
    COLUMNS.forEach((c) => (g[c.id] = []));
    leads.forEach((l) => g[l.status]?.push(l));
    return g;
  }, [leads]);

  const onDrop = async (status: Lead["status"]) => {
    if (!draggedId) return;
    const lead = leads.find((l) => l.id === draggedId);
    setDraggedId(null);
    if (!lead || lead.status === status) return;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    try { await updateLeadStatus({ data: { id: lead.id, status } }); }
    catch (e) { toast.error((e as Error).message); refresh(); }
  };

  const createLead = async () => {
    if (!creating?.name && !creating?.phone) {
      toast.error("Informe nome ou telefone.");
      return;
    }
    try {
      await upsertLead({
        data: {
          name: creating?.name || null,
          phone: creating?.phone || null,
          company: creating?.company || null,
          status: "novo",
          origin: "manual",
        },
      });
      toast.success("Lead criado.");
      setCreating(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < new Date());

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1600px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-up">
        <div>
          <h1 className="font-serif text-4xl italic"><span className="text-gradient-gold">Comercial</span></h1>
          <p className="text-muted-foreground mt-1">Pipeline ativo · leads, conversas e tarefas em tempo real.</p>
        </div>
        <Button onClick={() => setCreating({})} className="bg-gradient-wine border border-accent/40">
          <Plus className="h-4 w-4 mr-2" /> Novo lead
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total de leads" value={leads.length} />
        <StatCard label="Em negociação" value={grouped.negociacao.length} highlight />
        <StatCard label="Não lidos" value={leads.filter((l) => l.unread_count > 0).length} />
        <StatCard label="Tarefas atrasadas" value={overdueTasks.length} danger={overdueTasks.length > 0} />
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col.id)}
            className="min-h-[500px] rounded-xl bg-card/30 border border-accent/10 p-3"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{col.label}</h3>
              <Badge variant="secondary" className="text-xs">{grouped[col.id].length}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[col.id].map((l) => <LeadCard key={l.id} lead={l} onDragStart={() => setDraggedId(l.id)} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Tasks panel */}
      {tasks.length > 0 && (
        <Card className="glass border-accent/10 p-5 mt-8 animate-fade-up">
          <h3 className="font-serif text-xl mb-4">Tarefas abertas</h3>
          <div className="space-y-2">
            {tasks.slice(0, 10).map((t) => {
              const overdue = t.due_at && new Date(t.due_at) < new Date();
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-accent/10 bg-card/40">
                  <Clock className={`h-4 w-4 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{t.title}</div>
                    {t.lead && (
                      <Link to="/comercial/lead/$id" params={{ id: t.lead.id }} className="text-xs text-accent hover:underline">
                        {t.lead.name || t.lead.phone}
                      </Link>
                    )}
                  </div>
                  {t.due_at && (
                    <span className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {new Date(t.due_at).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => { await completeTask({ data: { id: t.id } }); refresh(); }}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
          {creating && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={creating.name || ""} onChange={(e) => setCreating({ ...creating, name: e.target.value })} /></div>
              <div><Label>Telefone (com DDD)</Label><Input value={creating.phone || ""} onChange={(e) => setCreating({ ...creating, phone: e.target.value })} placeholder="11999999999" /></div>
              <div><Label>Empresa</Label><Input value={creating.company || ""} onChange={(e) => setCreating({ ...creating, company: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setCreating(null)}>Cancelar</Button><Button onClick={createLead} className="bg-gradient-wine border border-accent/40">Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, highlight, danger }: { label: string; value: number; highlight?: boolean; danger?: boolean }) {
  return (
    <Card className={`glass border-accent/10 p-4 ${danger ? "border-destructive/40" : highlight ? "border-accent/40" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-serif text-3xl mt-1 ${danger ? "text-destructive" : highlight ? "text-accent" : ""}`}>{value}</div>
    </Card>
  );
}

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: () => void }) {
  const overdue = lead.next_followup_at && new Date(lead.next_followup_at) < new Date();
  const lastWA = lead.last_interaction_at ? new Date(lead.last_interaction_at) : null;
  const stale = lastWA && (Date.now() - lastWA.getTime()) > 1000 * 60 * 60 * 48;

  return (
    <Link
      to="/comercial/lead/$id"
      params={{ id: lead.id }}
      draggable
      onDragStart={onDragStart}
      className="block p-3 rounded-lg bg-background/60 border border-accent/10 hover:border-accent/40 transition cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-sm font-medium truncate">{lead.name || "Sem nome"}</div>
        {lead.unread_count > 0 && (
          <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px] h-5 px-1.5">{lead.unread_count}</Badge>
        )}
      </div>
      {lead.company && <div className="text-xs text-muted-foreground truncate">{lead.company}</div>}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
        {lead.origin === "whatsapp" && <MessageCircle className="h-3 w-3 text-emerald-400" />}
        {(overdue || stale) && <AlertCircle className="h-3 w-3 text-destructive" />}
      </div>
    </Link>
  );
}
