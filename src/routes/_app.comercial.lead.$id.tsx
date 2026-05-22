import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getLead, addNote, sendWaMessage, aiSuggestReply, upsertTask, deleteLead, upsertLead } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Send, Sparkles, Plus, Phone, Building2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/comercial/lead/$id")({
  head: () => ({ meta: [{ title: "RAVIN · Lead" }] }),
  component: LeadPage,
});

type Msg = { id: string; direction: "in" | "out"; content: string; timestamp: string };
type Note = { id: string; kind: string; content: string; created_at: string };
type Task = { id: string; title: string; due_at: string | null; status: string };

function LeadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{ lead: any; messages: Msg[]; notes: Note[]; tasks: Task[] } | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [newTask, setNewTask] = useState<{ title: string; due_at: string }>({ title: "", due_at: "" });
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try { setData(await getLead({ data: { id } }) as any); }
    catch (e) { toast.error((e as Error).message); navigate({ to: "/comercial" }); }
  };
  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    const ch = supabase
      .channel(`lead-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages", filter: `lead_id=eq.${id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  if (!data) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;
  }

  const { lead, messages, notes, tasks } = data;

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendWaMessage({ data: { lead_id: id, text: text.trim() } });
      setText("");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const suggest = async () => {
    setAiBusy(true);
    try {
      const r = await aiSuggestReply({ data: { lead_id: id } });
      setText(r.text);
      toast.success("Sugestão pronta. Revise e envie.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiBusy(false); }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      await addNote({ data: { lead_id: id, content: note.trim() } });
      setNote("");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const saveTask = async () => {
    if (!newTask.title) return;
    try {
      await upsertTask({ data: { title: newTask.title, due_at: newTask.due_at || null, lead_id: id } });
      setTaskOpen(false); setNewTask({ title: "", due_at: "" });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const removeLead = async () => {
    if (!confirm("Excluir este lead? Toda a conversa será removida.")) return;
    try { await deleteLead({ data: { id } }); navigate({ to: "/comercial" }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const statusBadge: Record<string, string> = {
    novo: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    qualificado: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    proposta: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    negociacao: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    fechado: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    perdido: "bg-muted text-muted-foreground",
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/comercial"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button></Link>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={removeLead} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-1" /> Excluir
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sidebar info */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="glass border-accent/10 p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="font-serif text-2xl">{lead.name || "Sem nome"}</h2>
                {lead.company && <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Building2 className="h-3 w-3" />{lead.company}</div>}
              </div>
              <Badge className={statusBadge[lead.status]}>{lead.status}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              {lead.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3 w-3" />{lead.phone}</div>}
              {lead.email && <div className="text-muted-foreground">{lead.email}</div>}
              {lead.cnpj && <div className="text-muted-foreground">CNPJ: {lead.cnpj}</div>}
              <div className="text-xs text-muted-foreground pt-2 border-t border-accent/10">
                Origem: {lead.origin} · Criado em {new Date(lead.created_at).toLocaleDateString("pt-BR")}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="mt-3 w-full border-accent/30">Editar dados</Button>
          </Card>

          <Card className="glass border-accent/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg">Tarefas</h3>
              <Button size="sm" variant="ghost" onClick={() => setTaskOpen(true)}><Plus className="h-4 w-4" /></Button>
            </div>
            {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p> :
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="text-sm flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${t.status === "concluida" ? "bg-emerald-400" : t.due_at && new Date(t.due_at) < new Date() ? "bg-destructive" : "bg-amber-400"}`} />
                    <span className={`flex-1 ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                    {t.due_at && <span className="text-xs text-muted-foreground">{new Date(t.due_at).toLocaleDateString("pt-BR")}</span>}
                  </li>
                ))}
              </ul>
            }
          </Card>

          <Card className="glass border-accent/10 p-5">
            <h3 className="font-serif text-lg mb-3">Anotação rápida</h3>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Registre uma observação..." className="mb-2" />
            <Button size="sm" onClick={saveNote} disabled={!note.trim()} className="w-full bg-gradient-wine border border-accent/40">Salvar nota</Button>
          </Card>
        </div>

        {/* Main: chat & timeline */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="chat" className="space-y-4">
            <TabsList className="bg-card/50 border border-accent/10">
              <TabsTrigger value="chat">Conversa WhatsApp</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="chat">
              <Card className="glass border-accent/10 flex flex-col h-[70vh]">
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                      <Send className="h-8 w-8 opacity-40" />
                      Inicie a conversa enviando a primeira mensagem.
                    </div>
                  ) : messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.direction === "out" ? "bg-gradient-wine border border-accent/30" : "bg-card/60 border border-accent/10"}`}>
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.timestamp).toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-accent/10 p-3 space-y-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={suggest} disabled={aiBusy} className="border-accent/30">
                      {aiBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2 text-accent" />}
                      IA sugerir resposta
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Digite a mensagem..."
                      rows={2}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
                      className="resize-none"
                    />
                    <Button onClick={send} disabled={sending || !text.trim()} className="bg-gradient-wine border border-accent/40 self-end">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Ctrl/⌘ + Enter para enviar</p>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="timeline">
              <Card className="glass border-accent/10 p-5">
                {notes.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos ainda.</p> :
                  <div className="space-y-3">
                    {notes.map((n) => (
                      <div key={n.id} className="border-l-2 border-accent/30 pl-4">
                        <div className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")} · {n.kind}</div>
                        <div className="text-sm mt-1">{n.content}</div>
                      </div>
                    ))}
                  </div>
                }
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Edit lead dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>Editar lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input defaultValue={lead.name || ""} id="ed-name" /></div>
            <div><Label>Telefone</Label><Input defaultValue={lead.phone || ""} id="ed-phone" /></div>
            <div><Label>Empresa</Label><Input defaultValue={lead.company || ""} id="ed-company" /></div>
            <div><Label>CNPJ</Label><Input defaultValue={lead.cnpj || ""} id="ed-cnpj" /></div>
            <div><Label>E-mail</Label><Input defaultValue={lead.email || ""} id="ed-email" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={async () => {
              const get = (k: string) => (document.getElementById(`ed-${k}`) as HTMLInputElement)?.value || "";
              try {
                await upsertLead({ data: {
                  id,
                  name: get("name"),
                  phone: get("phone"),
                  company: get("company"),
                  cnpj: get("cnpj"),
                  email: get("email"),
                  status: lead.status,
                  origin: lead.origin,
                }});
                setEditOpen(false); refresh();
              } catch (e) { toast.error((e as Error).message); }
            }} className="bg-gradient-wine border border-accent/40">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New task dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} /></div>
            <div><Label>Vencimento</Label><Input type="datetime-local" value={newTask.due_at} onChange={(e) => setNewTask({ ...newTask, due_at: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>Cancelar</Button>
            <Button onClick={saveTask} className="bg-gradient-wine border border-accent/40">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
