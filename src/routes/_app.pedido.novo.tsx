import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, FileSpreadsheet,
  Mail, Sparkles, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  type Product, type Order,
  quantCx, descontoPct, precoTotalIPI, precoUnSIPI,
  orderTotals, BRL, PCT,
} from "@/lib/order-types";
import { buildOrderWorkbook, downloadBlob } from "@/lib/excel";
import { saveOrder, loadEmails, saveEmail, removeEmail } from "@/lib/orders-store";
import { generateOrderEmail } from "@/lib/ai.functions";

export const Route = createFileRoute("/_app/pedido/novo")({
  head: () => ({ meta: [{ title: "RAVIN · Novo Pedido" }] }),
  component: NewOrder,
});

const STEPS = ["Cliente", "Produtos", "Revisão", "Envio"] as const;

const emptyProduct = (): Product => ({
  codigo: "", cx: 6, descricao: "", ml: 750,
  quantUnitaria: 0, tabelaIPI: 0, precoVendaIPI: 0,
});

function todayBR() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

function NewOrder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [pedidoNumero, setPedidoNumero] = useState("");
  const [vendedor] = useState("DENIS");
  const [cliente, setCliente] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("SP");
  const [condPagto, setCondPagto] = useState("14/28/42");
  const [data, setData] = useState(todayBR());
  const [transportadora, setTransportadora] = useState("NOSSA");
  const [frete, setFrete] = useState("");
  const [obs, setObs] = useState("");
  const [descontoGeral, setDescontoGeral] = useState(4);
  const [produtos, setProdutos] = useState<Product[]>([emptyProduct()]);

  const [generating, setGenerating] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState("");
  const [savedEmails, setSavedEmails] = useState<string[]>(loadEmails());

  const totals = useMemo(() => orderTotals(produtos), [produtos]);
  const generateEmail = useServerFn(generateOrderEmail);

  const canNext = () => {
    if (step === 0) return cliente && cnpj && cidade && uf && data;
    if (step === 1)
      return produtos.length > 0 &&
        produtos.every((p) => p.codigo && p.descricao && p.quantUnitaria > 0 && p.precoVendaIPI > 0);
    return true;
  };

  const finalize = async () => {
    setGenerating(true);
    try {
      const order: Order = {
        id: crypto.randomUUID(),
        pedidoNumero, vendedor, cliente, cnpj, cidade, uf, condPagto,
        data, transportadora, frete, obs, descontoGeral, produtos,
        createdAt: new Date().toISOString(),
      };
      const result = await generateEmail({
        data: {
          cliente, pedidoNumero, data, vendedor, condPagto, transportadora,
          frete: frete || "—", obs,
          totalValor: totals.totalValor,
          totalCaixas: totals.totalCaixas,
          totalUnidades: totals.totalUnidades,
          produtos: produtos.map((p) => ({
            codigo: p.codigo,
            descricao: p.descricao,
            quantUnitaria: p.quantUnitaria,
            quantCx: quantCx(p),
            precoTotal: precoTotalIPI(p),
          })),
        },
      });
      setEmailSubject(result.subject);
      setEmailBody(result.body);
      saveOrder(order);
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar e-mail.");
    } finally {
      setGenerating(false);
    }
  };

  const buildAndDownload = async () => {
    const order: Order = {
      id: crypto.randomUUID(),
      pedidoNumero, vendedor, cliente, cnpj, cidade, uf, condPagto,
      data, transportadora, frete, obs, descontoGeral, produtos,
      createdAt: new Date().toISOString(),
    };
    const blob = await buildOrderWorkbook(order);
    downloadBlob(blob, `Pedido_${cliente.replace(/\s+/g, "_")}_${data.replace(/\//g, "-")}.xlsx`);
    toast.success("Planilha baixada. Anexe ao e-mail.");
  };

  const addRecipient = (email?: string) => {
    const e = (email ?? newRecipient).trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("E-mail inválido."); return;
    }
    if (!recipients.includes(e)) setRecipients([...recipients, e]);
    saveEmail(e);
    setSavedEmails(loadEmails());
    setNewRecipient("");
  };

  const openMailClient = () => {
    if (recipients.length === 0) {
      toast.error("Adicione ao menos um destinatário."); return;
    }
    const url = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = url;
    toast.success("Cliente de e-mail aberto. Anexe a planilha antes de enviar.");
  };

  return (
    <div className="container mx-auto px-6 py-10 max-w-5xl">
      {/* Stepper */}
      <div className="mb-8 animate-fade-up">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="text-sm text-muted-foreground hover:text-accent flex items-center gap-1 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center gap-2 sm:gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 sm:gap-4 flex-1">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium border transition-all shrink-0 ${
                    i < step
                      ? "bg-accent text-accent-foreground border-accent"
                      : i === step
                      ? "bg-gradient-wine border-accent text-accent shadow-gold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`text-sm hidden sm:block ${
                    i === step ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px flex-1 ${i < step ? "bg-accent" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <Card className="glass border-accent/10 p-6 sm:p-10 animate-fade-up">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-serif italic text-3xl text-gradient-gold mb-1">Dados do cliente</h2>
              <p className="text-muted-foreground text-sm">Informações que aparecerão no cabeçalho do pedido.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Pedido Nº (opcional)"><Input value={pedidoNumero} onChange={(e) => setPedidoNumero(e.target.value)} /></Field>
              <Field label="Data"><Input value={data} onChange={(e) => setData(e.target.value)} placeholder="dd/mm/aa" /></Field>
              <Field label="Nome do Cliente *"><Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="FILADELFIA CARNES" /></Field>
              <Field label="CNPJ *"><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="07581" /></Field>
              <Field label="Cidade *"><Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="SP" /></Field>
              <Field label="UF *"><Input value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} /></Field>
              <Field label="Condição de Pagto."><Input value={condPagto} onChange={(e) => setCondPagto(e.target.value)} placeholder="14/28/42" /></Field>
              <Field label="Transportadora"><Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} /></Field>
              <Field label="Frete"><Input value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="CIF / FOB" /></Field>
              <Field label="Desconto geral (%)"><Input type="number" value={descontoGeral} onChange={(e) => setDescontoGeral(Number(e.target.value))} /></Field>
              <div className="sm:col-span-2">
                <Field label="Observações">
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: TERÇA FEIRA!" rows={2} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <h2 className="font-serif italic text-3xl text-gradient-gold mb-1">Produtos</h2>
                <p className="text-muted-foreground text-sm">Quant. CX, desconto, total e preço S/IPI são calculados automaticamente.</p>
              </div>
              <Button onClick={() => setProdutos([...produtos, emptyProduct()])} variant="outline" className="border-accent/30">
                <Plus className="h-4 w-4 mr-2" /> Adicionar item
              </Button>
            </div>

            <div className="space-y-3">
              {produtos.map((p, i) => (
                <Card key={i} className="bg-background/40 border-accent/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-accent/30 text-accent">Item {i + 1}</Badge>
                    {produtos.length > 1 && (
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setProdutos(produtos.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive h-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-6 gap-3">
                    <Field label="Código">
                      <Input value={p.codigo} onChange={(e) => updateProd(produtos, setProdutos, i, { codigo: e.target.value })} />
                    </Field>
                    <Field label="Cx">
                      <Input type="number" value={p.cx} onChange={(e) => updateProd(produtos, setProdutos, i, { cx: Number(e.target.value) })} />
                    </Field>
                    <div className="sm:col-span-4">
                      <Field label="Descrição">
                        <Input value={p.descricao} onChange={(e) => updateProd(produtos, setProdutos, i, { descricao: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Ml">
                      <Input type="number" value={p.ml} onChange={(e) => updateProd(produtos, setProdutos, i, { ml: Number(e.target.value) })} />
                    </Field>
                    <Field label="Quant. Un.">
                      <Input type="number" value={p.quantUnitaria || ""} onChange={(e) => updateProd(produtos, setProdutos, i, { quantUnitaria: Number(e.target.value) })} />
                    </Field>
                    <Field label="Tabela C/IPI">
                      <Input type="number" step="0.01" value={p.tabelaIPI || ""} onChange={(e) => updateProd(produtos, setProdutos, i, { tabelaIPI: Number(e.target.value) })} />
                    </Field>
                    <Field label="Preço venda C/IPI">
                      <Input type="number" step="0.01" value={p.precoVendaIPI || ""} onChange={(e) => updateProd(produtos, setProdutos, i, { precoVendaIPI: Number(e.target.value) })} />
                    </Field>
                    <div className="sm:col-span-2 grid grid-cols-3 gap-2 items-end">
                      <Calc label="Qt. CX" value={quantCx(p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} />
                      <Calc label="Desc." value={PCT(descontoPct(p))} />
                      <Calc label="Total" value={BRL.format(precoTotalIPI(p))} highlight />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-6 pt-4 border-t border-accent/10">
              <Stat label="Itens" value={String(produtos.length)} />
              <Stat label="Unidades" value={String(totals.totalUnidades)} />
              <Stat label="Caixas" value={totals.totalCaixas.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} />
              <Stat label="Total" value={`R$ ${BRL.format(totals.totalValor)}`} highlight />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-serif italic text-3xl text-gradient-gold mb-1">Revisão do pedido</h2>
              <p className="text-muted-foreground text-sm">Confira os dados antes de gerar a planilha e o e-mail.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Info label="Cliente" value={cliente} />
              <Info label="CNPJ" value={cnpj} />
              <Info label="Cidade / UF" value={`${cidade} / ${uf}`} />
              <Info label="Data" value={data} />
              <Info label="Cond. Pagto" value={condPagto} />
              <Info label="Transportadora" value={transportadora} />
              <Info label="Frete" value={frete || "—"} />
              <Info label="Desconto geral" value={`${descontoGeral}%`} />
              {obs && <div className="sm:col-span-2"><Info label="Obs" value={obs} /></div>}
            </div>
            <div className="overflow-x-auto border border-accent/10 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-accent/10 text-accent">
                  <tr>
                    <th className="text-left p-3">Código</th>
                    <th className="text-left p-3">Descrição</th>
                    <th className="text-right p-3">Un</th>
                    <th className="text-right p-3">Cx</th>
                    <th className="text-right p-3">Preço C/IPI</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p, i) => (
                    <tr key={i} className="border-t border-accent/10">
                      <td className="p-3 font-mono text-xs">{p.codigo}</td>
                      <td className="p-3">{p.descricao}</td>
                      <td className="p-3 text-right">{p.quantUnitaria}</td>
                      <td className="p-3 text-right">{quantCx(p).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</td>
                      <td className="p-3 text-right">{BRL.format(p.precoVendaIPI)}</td>
                      <td className="p-3 text-right font-medium">{BRL.format(precoTotalIPI(p))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gradient-wine border-t-2 border-accent/40">
                    <td colSpan={2} className="p-3 font-medium">Totais</td>
                    <td className="p-3 text-right">{totals.totalUnidades}</td>
                    <td className="p-3 text-right">{totals.totalCaixas.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</td>
                    <td className="p-3 text-right text-muted-foreground">—</td>
                    <td className="p-3 text-right font-serif text-lg text-accent">R$ {BRL.format(totals.totalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="font-serif italic text-3xl text-gradient-gold">E-mail gerado por IA</h2>
                <p className="text-muted-foreground text-sm">Revise, ajuste e dispare quando estiver pronto.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Field label="Assunto">
                  <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                </Field>
                <Field label="Mensagem">
                  <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={16} className="font-sans" />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={buildAndDownload} variant="outline" className="border-accent/30">
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Baixar planilha (.xlsx)
                  </Button>
                  <Button onClick={openMailClient} className="bg-gradient-wine border border-accent/40 shadow-gold">
                    <Mail className="h-4 w-4 mr-2" /> Abrir e enviar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dica: baixe a planilha primeiro, depois clique em <em>Abrir e enviar</em> e anexe o arquivo no seu cliente de e-mail.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Destinatários">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newRecipient}
                        onChange={(e) => setNewRecipient(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                        placeholder="email@empresa.com"
                      />
                      <Button size="sm" onClick={() => addRecipient()} className="bg-accent text-accent-foreground hover:opacity-90">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 min-h-[2rem]">
                      {recipients.map((e) => (
                        <Badge key={e} className="bg-accent/15 text-accent border-accent/30 gap-1">
                          {e}
                          <button onClick={() => setRecipients(recipients.filter((x) => x !== e))} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Field>
                {savedEmails.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">E-mails salvos</div>
                    <div className="flex flex-wrap gap-2">
                      {savedEmails.map((e) => (
                        <button
                          key={e}
                          onClick={() => addRecipient(e)}
                          className="text-xs px-2 py-1 rounded border border-accent/20 text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors group"
                        >
                          {e}
                          <span
                            onClick={(ev) => { ev.stopPropagation(); removeEmail(e); setSavedEmails(loadEmails()); }}
                            className="ml-2 opacity-0 group-hover:opacity-100"
                          >×</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Card className="bg-background/40 border-accent/10 p-4 text-sm">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Resumo</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Cliente</span><span className="font-medium">{cliente}</span></div>
                    <div className="flex justify-between"><span>Itens</span><span>{produtos.length}</span></div>
                    <div className="flex justify-between"><span>Total</span><span className="text-accent font-serif text-lg">R$ {BRL.format(totals.totalValor)}</span></div>
                  </div>
                </Card>
                <Button onClick={() => navigate({ to: "/dashboard" })} variant="ghost" className="w-full">
                  Concluir e voltar ao painel
                </Button>
              </div>
            </div>
          </div>
        )}

        {step < 3 && (
          <div className="flex justify-between items-center pt-8 mt-8 border-t border-accent/10">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="bg-gradient-wine border border-accent/40 shadow-gold"
              >
                Próximo <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={finalize}
                disabled={generating}
                className="bg-gradient-wine border border-accent/40 shadow-gold"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando com IA…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Gerar pedido e e-mail</>
                )}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function updateProd(
  arr: Product[], set: (p: Product[]) => void, i: number, patch: Partial<Product>,
) {
  set(arr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Calc({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-3 py-2 rounded border border-accent/10 bg-background/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${highlight ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-serif text-xl ${highlight ? "text-accent text-2xl" : ""}`}>{value}</div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-accent/10 rounded px-4 py-3 bg-background/30">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
