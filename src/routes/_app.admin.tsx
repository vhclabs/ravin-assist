import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listProducts,
  upsertProduct,
  deleteProduct,
  listUsers,
  upsertUser,
  deleteUser,
  listRecipients,
  upsertRecipient,
  deleteRecipient,
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  listInstances,
  createWaInstance,
  refreshQrCode,
  removeWaInstance,
  resetWaWebhook,
  listWebhookLogs,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw, Smartphone, QrCode, Loader2, Radio } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "RAVIN · Admin" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== "master") navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  if (!user || user.role !== "master") return null;

  return (
    <div className="container mx-auto px-6 py-10 max-w-7xl">
      <div className="mb-8 animate-fade-up">
        <h1 className="font-serif text-4xl italic">
          <span className="text-gradient-gold">Admin</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Estoque, WhatsApp, e-mails e usuários da operação.
        </p>
      </div>

      <Tabs defaultValue="produtos" className="space-y-6">
        <TabsList className="bg-card/50 border border-accent/10">
          <TabsTrigger value="produtos">Estoque</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="logs">Logs ao vivo</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos"><ProductsTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="logs"><WebhookLogsTab /></TabsContent>
        <TabsContent value="emails"><EmailsTab /></TabsContent>
        <TabsContent value="usuarios"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== PRODUCTS ============================== */
type Product = {
  id: string;
  sku: string | null;
  description: string;
  ncm: string | null;
  unit: string;
  qty_per_box: number;
  unit_price: number;
  ipi_pct: number;
  stock: number;
  active: boolean;
};

function ProductsTab() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await listProducts();
      setItems(data as Product[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      await upsertProduct({
        data: {
          id: editing.id,
          sku: editing.sku || null,
          description: editing.description || "",
          ncm: editing.ncm || null,
          unit: editing.unit || "UN",
          qty_per_box: Number(editing.qty_per_box) || 1,
          unit_price: Number(editing.unit_price) || 0,
          ipi_pct: Number(editing.ipi_pct ?? 6.5),
          stock: Number(editing.stock) || 0,
          active: editing.active ?? true,
        },
      });
      toast.success("Produto salvo.");
      setEditing(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    try {
      await deleteProduct({ data: { id } });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const filtered = items.filter((p) =>
    !search || p.description.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="glass border-accent/10 p-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background/40 border-accent/20"
        />
        <Button onClick={() => setEditing({ active: true, ipi_pct: 6.5, qty_per_box: 1, unit: "UN" })} className="bg-gradient-wine border border-accent/40 shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Novo produto
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">Nenhum produto cadastrado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-accent/10">
              <tr>
                <th className="text-left py-2 pr-3">SKU</th>
                <th className="text-left py-2 pr-3">Descrição</th>
                <th className="text-right py-2 pr-3">Cx</th>
                <th className="text-right py-2 pr-3">Preço</th>
                <th className="text-right py-2 pr-3">IPI%</th>
                <th className="text-right py-2 pr-3">Estoque</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-accent/5 hover:bg-accent/5">
                  <td className="py-2 pr-3 text-muted-foreground">{p.sku || "—"}</td>
                  <td className="py-2 pr-3">{p.description}</td>
                  <td className="py-2 pr-3 text-right">{p.qty_per_box}</td>
                  <td className="py-2 pr-3 text-right">R$ {Number(p.unit_price).toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right">{p.ipi_pct}%</td>
                  <td className={`py-2 pr-3 text-right ${p.stock <= 0 ? "text-destructive" : ""}`}>{p.stock}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Descrição *</Label><Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><Label>SKU</Label><Input value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} /></div>
              <div><Label>NCM</Label><Input value={editing.ncm || ""} onChange={(e) => setEditing({ ...editing, ncm: e.target.value })} /></div>
              <div><Label>Unidade</Label><Input value={editing.unit || "UN"} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
              <div><Label>Qtd / caixa</Label><Input type="number" value={editing.qty_per_box ?? 1} onChange={(e) => setEditing({ ...editing, qty_per_box: Number(e.target.value) })} /></div>
              <div><Label>Preço unit. (R$)</Label><Input type="number" step="0.01" value={editing.unit_price ?? 0} onChange={(e) => setEditing({ ...editing, unit_price: Number(e.target.value) })} /></div>
              <div><Label>IPI %</Label><Input type="number" step="0.01" value={editing.ipi_pct ?? 6.5} onChange={(e) => setEditing({ ...editing, ipi_pct: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label>Estoque (un)</Label><Input type="number" value={editing.stock ?? 0} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} className="bg-gradient-wine border border-accent/40">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================== WHATSAPP ============================== */
type WaInstance = {
  id: string;
  instance_name: string;
  status: "desconectado" | "conectando" | "conectado" | "erro";
  phone_number: string | null;
};

function WhatsAppTab() {
  const [items, setItems] = useState<WaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [qr, setQr] = useState<{ name: string; image: string | null } | null>(null);
  const [polling, setPolling] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setItems((await listInstances()) as WaInstance[]); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  // Poll QR when modal open
  useEffect(() => {
    if (!qr) return;
    setPolling(true);
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await refreshQrCode({ data: { name: qr.name } });
        if (r.connected) {
          toast.success("WhatsApp conectado!");
          setQr(null);
          refresh();
          return;
        }
        if (r.qrcode) setQr({ name: qr.name, image: r.qrcode });
      } catch { /* ignore */ }
      if (!stop) setTimeout(tick, 3500);
    };
    tick();
    return () => { stop = true; setPolling(false); };
  }, [qr?.name]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await createWaInstance({ data: { name: newName.trim() } });
      toast.success(`Instância "${r.name}" criada.`);
      setNewName("");
      setQr({ name: r.name, image: r.qrcode });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  };

  const remove = async (name: string) => {
    if (!confirm(`Remover instância "${name}"?`)) return;
    try { await removeWaInstance({ data: { name } }); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const resetHook = async (name: string) => {
    try {
      const r = await resetWaWebhook({ data: { name } });
      toast.success(`Webhook atualizado: ${r.webhook}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const openQr = (name: string) => setQr({ name, image: null });

  return (
    <Card className="glass border-accent/10 p-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input placeholder="Nome da instância (ex: ravin-vendas)" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-background/40 border-accent/20" />
        <Button onClick={create} disabled={creating || !newName.trim()} className="bg-gradient-wine border border-accent/40 shrink-0">
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Nova instância
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">Nenhuma instância. Crie uma para conectar o WhatsApp.</div>
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-4 p-4 rounded-xl border border-accent/10 bg-card/40">
              <div className="h-10 w-10 rounded-full bg-gradient-wine border border-accent/30 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{i.instance_name}</div>
                <div className="text-xs text-muted-foreground">{i.phone_number || "—"}</div>
              </div>
              <Badge variant={i.status === "conectado" ? "default" : "secondary"} className={
                i.status === "conectado" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                i.status === "conectando" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                "bg-muted/40"
              }>{i.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => openQr(i.instance_name)} className="border-accent/30">
                <QrCode className="h-4 w-4 mr-2" /> QR / Reconectar
              </Button>
              <Button size="sm" variant="outline" onClick={() => resetHook(i.instance_name)} className="border-accent/30" title="Reapontar webhook para a URL publicada">
                <RefreshCw className="h-4 w-4 mr-2" /> Webhook
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(i.instance_name)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="bg-card border-accent/20 sm:max-w-md">
          <DialogHeader><DialogTitle>Conectar WhatsApp · {qr?.name}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qr?.image ? (
              <img src={qr.image} alt="QR Code" className="w-64 h-64 rounded-lg bg-white p-2" />
            ) : (
              <div className="w-64 h-64 rounded-lg border border-dashed border-accent/30 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho. Escaneie o QR acima.
            </p>
            <p className="text-xs text-muted-foreground">
              {polling && <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Aguardando conexão…</span>}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================== EMAILS ============================== */
type Recipient = { id: string; name: string; email: string; tags: string[] };
type Template = { id: string; name: string; subject: string; body: string };

function EmailsTab() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingR, setEditingR] = useState<Partial<Recipient> | null>(null);
  const [editingT, setEditingT] = useState<Partial<Template> | null>(null);

  const refresh = async () => {
    try {
      const [r, t] = await Promise.all([listRecipients(), listTemplates()]);
      setRecipients(r as Recipient[]);
      setTemplates(t as Template[]);
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { refresh(); }, []);

  const saveR = async () => {
    if (!editingR?.name || !editingR.email) return;
    try {
      await upsertRecipient({ data: { id: editingR.id, name: editingR.name, email: editingR.email, tags: editingR.tags || [] } });
      setEditingR(null); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const saveT = async () => {
    if (!editingT?.name || !editingT.subject || !editingT.body) return;
    try {
      await upsertTemplate({ data: { id: editingT.id, name: editingT.name, subject: editingT.subject, body: editingT.body } });
      setEditingT(null); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 animate-fade-up">
      <Card className="glass border-accent/10 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-xl">Destinatários</h3>
          <Button size="sm" onClick={() => setEditingR({})} className="bg-gradient-wine border border-accent/40"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>
        <div className="space-y-2">
          {recipients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum destinatário salvo.</p> :
            recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-accent/10 bg-card/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditingR(r)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteRecipient({ data: { id: r.id } }); refresh(); }} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
        </div>
      </Card>

      <Card className="glass border-accent/10 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-xl">Modelos de e-mail</h3>
          <Button size="sm" onClick={() => setEditingT({})} className="bg-gradient-wine border border-accent/40"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>
        <div className="space-y-2">
          {templates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p> :
            templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-accent/10 bg-card/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditingT(t)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteTemplate({ data: { id: t.id } }); refresh(); }} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
        </div>
      </Card>

      <Dialog open={!!editingR} onOpenChange={(o) => !o && setEditingR(null)}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>{editingR?.id ? "Editar destinatário" : "Novo destinatário"}</DialogTitle></DialogHeader>
          {editingR && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editingR.name || ""} onChange={(e) => setEditingR({ ...editingR, name: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input type="email" value={editingR.email || ""} onChange={(e) => setEditingR({ ...editingR, email: e.target.value })} /></div>
              <div><Label>Tags (separe por vírgula)</Label><Input value={(editingR.tags || []).join(", ")} onChange={(e) => setEditingR({ ...editingR, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEditingR(null)}>Cancelar</Button><Button onClick={saveR} className="bg-gradient-wine border border-accent/40">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingT} onOpenChange={(o) => !o && setEditingT(null)}>
        <DialogContent className="bg-card border-accent/20 sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingT?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          {editingT && (
            <div className="space-y-3">
              <div><Label>Nome do modelo</Label><Input value={editingT.name || ""} onChange={(e) => setEditingT({ ...editingT, name: e.target.value })} /></div>
              <div><Label>Assunto</Label><Input value={editingT.subject || ""} onChange={(e) => setEditingT({ ...editingT, subject: e.target.value })} /></div>
              <div><Label>Corpo</Label><Textarea rows={10} value={editingT.body || ""} onChange={(e) => setEditingT({ ...editingT, body: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEditingT(null)}>Cancelar</Button><Button onClick={saveT} className="bg-gradient-wine border border-accent/40">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================== USERS ============================== */
type AppUser = { id: string; name: string; role: "master" | "vendedor"; active: boolean };

function UsersTab() {
  const [items, setItems] = useState<AppUser[]>([]);
  const [editing, setEditing] = useState<Partial<AppUser> & { passcode?: string } | null>(null);

  const refresh = async () => {
    try { setItems((await listUsers()) as AppUser[]); }
    catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!editing?.name || !editing.passcode) {
      toast.error("Nome e credencial são obrigatórios.");
      return;
    }
    try {
      await upsertUser({
        data: {
          id: editing.id,
          name: editing.name,
          passcode: editing.passcode,
          role: editing.role || "vendedor",
          active: editing.active ?? true,
        },
      });
      setEditing(null); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Card className="glass border-accent/10 p-6 animate-fade-up">
      <div className="flex justify-end mb-4">
        <Button onClick={() => setEditing({ role: "vendedor", active: true })} className="bg-gradient-wine border border-accent/40"><Plus className="h-4 w-4 mr-2" /> Novo usuário</Button>
      </div>
      <div className="space-y-2">
        {items.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border border-accent/10 bg-card/40">
            <div className="flex-1">
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.role === "master" ? "Master" : "Vendedor"} · {u.active ? "Ativo" : "Inativo"}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ ...u, passcode: "" })}><Pencil className="h-4 w-4" /></Button>
            {u.role !== "master" && (
              <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Excluir?")) { await deleteUser({ data: { id: u.id } }); refresh(); } }} className="hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-card border-accent/20">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Credencial (passcode)</Label><Input type="text" placeholder={editing.id ? "Deixe vazio para manter" : "Defina a credencial"} value={editing.passcode || ""} onChange={(e) => setEditing({ ...editing, passcode: e.target.value })} /></div>
              <div><Label>Papel</Label>
                <Select value={editing.role || "vendedor"} onValueChange={(v) => setEditing({ ...editing, role: v as "master" | "vendedor" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><Label>Ativo</Label></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} className="bg-gradient-wine border border-accent/40">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
