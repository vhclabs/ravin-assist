import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, FileSpreadsheet, Trash2 } from "lucide-react";
import { loadOrders, deleteOrder } from "@/lib/orders-store";
import { type Order, orderTotals, BRL } from "@/lib/order-types";
import { buildOrderWorkbook, downloadBlob } from "@/lib/excel";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "RAVIN · Pedidos" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => setOrders(loadOrders()), []);

  const onDelete = (id: string) => {
    if (!confirm("Excluir este pedido?")) return;
    deleteOrder(id);
    setOrders(loadOrders());
  };

  const onDownload = async (o: Order) => {
    const blob = await buildOrderWorkbook(o);
    downloadBlob(blob, `Pedido_${o.cliente.replace(/\s+/g, "_")}_${o.data.replace(/\//g, "-")}.xlsx`);
    toast.success("Planilha gerada.");
  };

  return (
    <div className="container mx-auto px-6 py-12 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 animate-fade-up">
        <div>
          <h1 className="font-serif text-4xl sm:text-5xl italic">
            <span className="text-gradient-gold">Pedidos</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Crie, gere planilhas e dispare e-mails formais com poucos cliques.
          </p>
        </div>
        <Link to="/pedido/novo">
          <Button className="bg-gradient-wine border border-accent/40 h-12 px-6 text-base shadow-gold hover:opacity-90">
            <Plus className="h-5 w-5 mr-2" />
            Criar pedido
          </Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card className="glass border-accent/10 p-16 text-center animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-wine border border-accent/30 flex items-center justify-center mb-6 shadow-gold">
            <FileSpreadsheet className="h-7 w-7 text-accent" />
          </div>
          <h2 className="font-serif text-2xl italic mb-2">Nenhum pedido ainda</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Comece criando seu primeiro pedido. O assistente cuida da planilha e do e-mail formal automaticamente.
          </p>
          <Link to="/pedido/novo">
            <Button className="bg-gradient-wine border border-accent/40">
              <Plus className="h-4 w-4 mr-2" /> Criar primeiro pedido
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {orders.map((o, idx) => {
            const t = orderTotals(o.produtos);
            return (
              <Card
                key={o.id}
                className="glass border-accent/10 p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-accent/30 transition-all animate-fade-up"
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-serif text-xl truncate">{o.cliente}</span>
                    {o.pedidoNumero && (
                      <span className="text-xs text-muted-foreground">Nº {o.pedidoNumero}</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>{o.data}</span>
                    <span>{o.cidade}/{o.uf}</span>
                    <span>{o.produtos.length} itens · {t.totalUnidades} un</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
                  <div className="font-serif text-2xl text-accent">R$ {BRL.format(t.totalValor)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onDownload(o)} className="border-accent/30">
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(o.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
