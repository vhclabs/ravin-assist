import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  cliente: z.string(),
  pedidoNumero: z.string(),
  data: z.string(),
  vendedor: z.string(),
  condPagto: z.string(),
  transportadora: z.string(),
  frete: z.string(),
  obs: z.string().optional().default(""),
  totalValor: z.number(),
  totalCaixas: z.number(),
  totalUnidades: z.number(),
  produtos: z.array(
    z.object({
      codigo: z.string(),
      descricao: z.string(),
      quantUnitaria: z.number(),
      quantCx: z.number(),
      precoTotal: z.number(),
    }),
  ),
});

export const generateOrderEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada.");
    }

    const itensTxt = data.produtos
      .map(
        (p) =>
          `• ${p.codigo} — ${p.descricao} | ${p.quantUnitaria} un (${p.quantCx.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} cx) — R$ ${p.precoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      )
      .join("\n");

    const prompt = `Você é o assistente de pedidos da RAVIN — importadora e distribuidora de vinhos finos. Escreva um e-mail formal, cordial e direto em português brasileiro para confirmar o envio de um pedido de venda ao cliente.

Dados do pedido:
- Cliente: ${data.cliente}
- Pedido Nº: ${data.pedidoNumero || "(a confirmar)"}
- Data: ${data.data}
- Vendedor: ${data.vendedor}
- Condição de pagamento: ${data.condPagto}
- Transportadora: ${data.transportadora}
- Frete: ${data.frete}
- Observações: ${data.obs || "—"}

Itens (${data.produtos.length}):
${itensTxt}

Totais: ${data.totalUnidades} unidades / ${data.totalCaixas.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} caixas / R$ ${data.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}

Regras de escrita:
- Tom profissional, elegante (estamos vendendo vinho), sem ser pomposo.
- Português do Brasil.
- Estrutura: saudação → introdução curta → resumo do pedido (itens em bullets) → totais → próximos passos (planilha em anexo, prazos) → encerramento cordial assinado por "Denis — RAVIN, Vinho do seu jeito".
- NÃO inclua linha de "Assunto:" no corpo.
- Retorne APENAS o corpo do e-mail em texto puro, sem markdown.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você redige e-mails comerciais formais em português brasileiro." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em alguns instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      const t = await res.text();
      console.error("AI gateway error", res.status, t);
      throw new Error("Falha ao gerar o e-mail com IA.");
    }
    const json = await res.json();
    const body: string = json.choices?.[0]?.message?.content?.trim() ?? "";
    const subject = `Pedido de Venda${data.pedidoNumero ? ` Nº ${data.pedidoNumero}` : ""} — RAVIN — ${data.cliente}`;
    return { subject, body };
  });
