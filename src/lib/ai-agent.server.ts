// AI Agent with tool-calling for WhatsApp commands (server-only).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendText } from "./evolution.server";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type ToolCall = { id: string; function: { name: string; arguments: string } };

// ---------- Tool definitions exposed to the model ----------
const tools = [
  {
    type: "function",
    function: {
      name: "listar_pedidos",
      description: "Lista pedidos recentes. Pode filtrar por status (rascunho, enviado, confirmado) e quantidade.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "rascunho | enviado | confirmado" },
          limit: { type: "number", description: "Máximo de itens (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumir_pedidos",
      description: "Resumo agregado dos pedidos em um período (hoje, semana, mes).",
      parameters: {
        type: "object",
        properties: { periodo: { type: "string", description: "hoje | semana | mes" } },
        required: ["periodo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_tarefas",
      description: "Lista tarefas/follow-ups pendentes, opcionalmente filtrando por status ou atraso.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "pendente | concluida | cancelada" },
          atrasadas: { type: "boolean", description: "Se true, só retorna vencidas" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Cria uma nova tarefa/follow-up.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          due_at: { type: "string", description: "ISO 8601 ou natural (ex: 'amanhã 14h')" },
          lead_name: { type: "string", description: "Nome ou empresa do lead/cliente associado" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "concluir_tarefa",
      description: "Marca uma tarefa como concluída a partir do título ou id.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Trecho do título ou id" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "excluir_tarefa",
      description: "Exclui uma tarefa (requer confirmação).",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_leads",
      description: "Lista clientes/leads do CRM, opcionalmente filtrando por status ou busca textual.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          busca: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_lead",
      description: "Cria um novo lead/cliente.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          cnpj: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_lead",
      description: "Edita campos de um lead identificado por nome/empresa.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou empresa do lead" },
          patch: { type: "object", description: "Campos a alterar (status, notes, email, phone, etc.)" },
        },
        required: ["query", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "excluir_lead",
      description: "Exclui um lead (requer confirmação).",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_estoque",
      description: "Consulta estoque por busca textual no nome/SKU.",
      parameters: {
        type: "object",
        properties: { busca: { type: "string" }, limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ajustar_estoque",
      description: "Ajusta o saldo de um produto (set absoluto ou delta).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Busca do produto" },
          set: { type: "number", description: "Define saldo absoluto" },
          delta: { type: "number", description: "Soma ou subtrai do saldo (use negativo para subtrair)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proximas_contas",
      description: "Lista próximos follow-ups e prazos (tarefas com due_at futuro).",
      parameters: {
        type: "object",
        properties: { dias: { type: "number", description: "Janela em dias (default 7)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_pedido_rascunho",
      description: "Cria um pedido em rascunho a partir de uma descrição livre. Faz parse de itens (produto + quantidade) e cliente.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome ou empresa do cliente" },
          itens: {
            type: "array",
            description: "Lista de itens",
            items: {
              type: "object",
              properties: {
                produto: { type: "string", description: "Busca textual do produto" },
                quantidade: { type: "number" },
              },
              required: ["produto", "quantidade"],
            },
          },
          observacoes: { type: "string" },
        },
        required: ["cliente", "itens"],
      },
    },
  },
];

const DESTRUCTIVE = new Set(["excluir_tarefa", "excluir_lead", "ajustar_estoque", "editar_lead"]);

// ---------- Tool implementations ----------
async function execTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "listar_pedidos": {
      const limit = Math.min(Number(args.limit) || 10, 50);
      let q = supabaseAdmin.from("orders").select("id,number,status,client_data,totals,created_at").order("created_at", { ascending: false }).limit(limit);
      if (args.status) q = q.eq("status", String(args.status));
      const { data, error } = await q;
      if (error) return `Erro: ${error.message}`;
      if (!data?.length) return "Nenhum pedido encontrado.";
      return data.map((o) => {
        const c = (o.client_data as { company?: string; name?: string } | null) || {};
        const t = (o.totals as { total?: number } | null) || {};
        return `#${o.number || o.id.slice(0, 8)} • ${c.company || c.name || "-"} • ${o.status} • R$ ${Number(t.total || 0).toFixed(2)}`;
      }).join("\n");
    }
    case "resumir_pedidos": {
      const periodo = String(args.periodo || "hoje");
      const since = new Date();
      if (periodo === "hoje") since.setHours(0, 0, 0, 0);
      else if (periodo === "semana") since.setDate(since.getDate() - 7);
      else since.setMonth(since.getMonth() - 1);
      const { data } = await supabaseAdmin.from("orders").select("status,totals,created_at").gte("created_at", since.toISOString());
      const rows = data || [];
      const total = rows.reduce((s, r) => s + Number((r.totals as { total?: number } | null)?.total || 0), 0);
      const byStatus: Record<string, number> = {};
      rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
      const breakdown = Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(" | ");
      return `Período: ${periodo}\nQtd pedidos: ${rows.length}\nValor total: R$ ${total.toFixed(2)}\n${breakdown || "Sem pedidos."}`;
    }
    case "listar_tarefas": {
      const limit = Math.min(Number(args.limit) || 15, 50);
      let q = supabaseAdmin.from("tasks").select("id,title,description,status,due_at").order("due_at", { ascending: true, nullsFirst: false }).limit(limit);
      q = q.eq("status", (args.status as never) || ("pendente" as never));
      if (args.atrasadas) q = q.lt("due_at", new Date().toISOString());
      const { data, error } = await q;
      if (error) return `Erro: ${error.message}`;
      if (!data?.length) return "Nenhuma tarefa.";
      return data.map((t) => `• ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleString("pt-BR")})` : ""}`).join("\n");
    }
    case "criar_tarefa": {
      const title = String(args.title);
      let due_at: string | null = null;
      if (args.due_at) { const d = new Date(String(args.due_at)); if (!isNaN(d.getTime())) due_at = d.toISOString(); }
      let lead_id: string | null = null;
      if (args.lead_name) {
        const { data: l } = await supabaseAdmin.from("leads").select("id").or(`name.ilike.%${args.lead_name}%,company.ilike.%${args.lead_name}%`).limit(1).maybeSingle();
        lead_id = l?.id || null;
      }
      const { data, error } = await supabaseAdmin.from("tasks").insert({ title, description: args.description ? String(args.description) : null, due_at, lead_id }).select("id,title").single();
      if (error) return `Erro: ${error.message}`;
      return `Tarefa criada: ${data.title}`;
    }
    case "concluir_tarefa": {
      const { data: t } = await supabaseAdmin.from("tasks").select("id,title").or(`id.eq.${args.query},title.ilike.%${args.query}%`).limit(1).maybeSingle();
      if (!t) return "Tarefa não encontrada.";
      await supabaseAdmin.from("tasks").update({ status: "concluida" }).eq("id", t.id);
      return `Concluída: ${t.title}`;
    }
    case "excluir_tarefa": {
      const { data: t } = await supabaseAdmin.from("tasks").select("id,title").or(`id.eq.${args.query},title.ilike.%${args.query}%`).limit(1).maybeSingle();
      if (!t) return "Tarefa não encontrada.";
      await supabaseAdmin.from("tasks").delete().eq("id", t.id);
      return `Excluída: ${t.title}`;
    }
    case "listar_leads": {
      const limit = Math.min(Number(args.limit) || 15, 50);
      let q = supabaseAdmin.from("leads").select("id,name,company,status,phone,last_interaction_at").order("last_interaction_at", { ascending: false, nullsFirst: false }).limit(limit);
      if (args.status) q = q.eq("status", args.status as never);
      if (args.busca) q = q.or(`name.ilike.%${args.busca}%,company.ilike.%${args.busca}%,phone.ilike.%${args.busca}%`);
      const { data, error } = await q;
      if (error) return `Erro: ${error.message}`;
      if (!data?.length) return "Nenhum lead.";
      return data.map((l) => `• ${l.company || l.name || l.phone} [${l.status}]`).join("\n");
    }
    case "criar_lead": {
      const { data, error } = await supabaseAdmin.from("leads").insert({
        name: args.name ? String(args.name) : null,
        company: args.company ? String(args.company) : null,
        phone: args.phone ? String(args.phone).replace(/\D/g, "") : null,
        email: args.email ? String(args.email) : null,
        cnpj: args.cnpj ? String(args.cnpj) : null,
        notes: args.notes ? String(args.notes) : null,
        origin: "agente_ia",
        status: "novo",
      }).select("id,name,company").single();
      if (error) return `Erro: ${error.message}`;
      return `Lead criado: ${data.company || data.name}`;
    }
    case "editar_lead": {
      const { data: l } = await supabaseAdmin.from("leads").select("id").or(`name.ilike.%${args.query}%,company.ilike.%${args.query}%`).limit(1).maybeSingle();
      if (!l) return "Lead não encontrado.";
      const patch = (args.patch || {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin.from("leads").update(patch as never).eq("id", l.id);
      if (error) return `Erro: ${error.message}`;
      return "Lead atualizado.";
    }
    case "excluir_lead": {
      const { data: l } = await supabaseAdmin.from("leads").select("id,company,name").or(`name.ilike.%${args.query}%,company.ilike.%${args.query}%`).limit(1).maybeSingle();
      if (!l) return "Lead não encontrado.";
      await supabaseAdmin.from("leads").delete().eq("id", l.id);
      return `Excluído: ${l.company || l.name}`;
    }
    case "consultar_estoque": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      let q = supabaseAdmin.from("products").select("id,sku,description,stock,unit_price,unit").eq("active", true).order("description").limit(limit);
      if (args.busca) q = q.or(`description.ilike.%${args.busca}%,sku.ilike.%${args.busca}%`);
      const { data, error } = await q;
      if (error) return `Erro: ${error.message}`;
      if (!data?.length) return "Nenhum produto.";
      return data.map((p) => `• ${p.description} • saldo ${p.stock} ${p.unit} • R$ ${Number(p.unit_price).toFixed(2)}`).join("\n");
    }
    case "ajustar_estoque": {
      const { data: p } = await supabaseAdmin.from("products").select("id,description,stock").or(`description.ilike.%${args.query}%,sku.ilike.%${args.query}%`).limit(1).maybeSingle();
      if (!p) return "Produto não encontrado.";
      let novo = p.stock;
      if (typeof args.set === "number") novo = Math.max(0, args.set);
      else if (typeof args.delta === "number") novo = Math.max(0, p.stock + args.delta);
      await supabaseAdmin.from("products").update({ stock: novo }).eq("id", p.id);
      return `${p.description}: ${p.stock} → ${novo}`;
    }
    case "proximas_contas": {
      const dias = Number(args.dias) || 7;
      const until = new Date(); until.setDate(until.getDate() + dias);
      const { data } = await supabaseAdmin.from("tasks").select("title,due_at").eq("status", "pendente").gte("due_at", new Date().toISOString()).lte("due_at", until.toISOString()).order("due_at");
      if (!data?.length) return `Sem follow-ups nos próximos ${dias} dias.`;
      return data.map((t) => `• ${new Date(t.due_at!).toLocaleString("pt-BR")} — ${t.title}`).join("\n");
    }
    case "criar_pedido_rascunho": {
      const cliente = String(args.cliente);
      const itensIn = (args.itens as Array<{ produto: string; quantidade: number }>) || [];
      let { data: lead } = await supabaseAdmin.from("leads").select("id,name,company,cnpj,email,phone").or(`name.ilike.%${cliente}%,company.ilike.%${cliente}%`).limit(1).maybeSingle();
      if (!lead) {
        const ins = await supabaseAdmin.from("leads").insert({ company: cliente, name: cliente, origin: "agente_ia", status: "negociacao" }).select("id,name,company,cnpj,email,phone").single();
        lead = ins.data;
      }
      const itensResolved: Array<{ description: string; qty: number; unit_price: number; ipi_pct: number; total: number }> = [];
      let subtotal = 0;
      const naoEncontrados: string[] = [];
      for (const it of itensIn) {
        const { data: prod } = await supabaseAdmin.from("products").select("description,unit_price,ipi_pct").or(`description.ilike.%${it.produto}%,sku.ilike.%${it.produto}%`).limit(1).maybeSingle();
        if (!prod) { naoEncontrados.push(it.produto); continue; }
        const total = Number(prod.unit_price) * it.quantidade;
        subtotal += total;
        itensResolved.push({ description: prod.description, qty: it.quantidade, unit_price: Number(prod.unit_price), ipi_pct: Number(prod.ipi_pct), total });
      }
      const totals = { subtotal, total: subtotal };
      const { data: order } = await supabaseAdmin.from("orders").insert({
        lead_id: lead?.id,
        client_data: { company: lead?.company, name: lead?.name, cnpj: lead?.cnpj, email: lead?.email, phone: lead?.phone },
        items: itensResolved,
        totals,
        status: "rascunho",
      }).select("id").single();
      const warn = naoEncontrados.length ? `\n⚠️ Não encontrados: ${naoEncontrados.join(", ")}` : "";
      return `Pedido rascunho criado (#${order?.id.slice(0, 8)}) para ${cliente}.\n${itensResolved.length} itens • Total R$ ${subtotal.toFixed(2)}${warn}\nAbra o app para revisar e enviar.`;
    }
  }
  return `Ferramenta ${name} desconhecida.`;
}

// ---------- Main entrypoint ----------
const SYSTEM_PROMPT = `Você é o assistente Jarvis da RAVIN Wine, falando com o Denis pelo WhatsApp.
Responda sempre em português do Brasil, curto e direto, com emojis pontuais (🍷 📋 ✅).
Use as ferramentas disponíveis para ler/escrever no sistema. Antes de qualquer ação destrutiva (excluir, editar dados existentes, ajustar estoque), explique o que vai fazer e peça "confirmar" - só execute na próxima mensagem se ele responder "sim/confirmar/ok".
Quando criar pedido, faça parse natural: "pedido pro Mercadinho do Zé: 10cx Malbec 2020, 5 Cabernet" → identifique cliente e itens.
Não invente dados que não estão no sistema.`;

async function checkPending(phone: string, content: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agent_pending").select("action,summary").eq("phone", phone).maybeSingle();
  if (!data) return null;
  const low = content.trim().toLowerCase();
  await supabaseAdmin.from("agent_pending").delete().eq("phone", phone);
  if (["sim", "ok", "confirmar", "confirmo", "pode", "vai", "yes", "s"].includes(low)) {
    const a = data.action as { name: string; args: Record<string, unknown> };
    return await execTool(a.name, a.args);
  }
  return `❌ Cancelado: ${data.summary}`;
}

export async function runAgent(opts: { instanceName: string; phone: string; jid: string; content: string }): Promise<void> {
  const { instanceName, phone, jid, content } = opts;

  const { data: inst } = await supabaseAdmin
    .from("wa_instances")
    .select("api_token")
    .eq("instance_name", instanceName)
    .maybeSingle();
  const sendReply = (text: string) => sendText(instanceName, phone, text, inst?.api_token || undefined);

  // 1. Pending confirmation?
  const pendingReply = await checkPending(phone, content);
  if (pendingReply !== null) {
    await sendReply(pendingReply);
    return;
  }

  // 2. Call Lovable AI
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    await sendReply("⚠️ Agente IA indisponível (LOVABLE_API_KEY ausente).");
    return;
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];

  for (let step = 0; step < 4; step++) {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI error", res.status, txt);
      await sendReply(`⚠️ IA falhou (${res.status}). Tente novamente.`);
      return;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }> };
    const msg = json.choices?.[0]?.message;
    if (!msg) { await sendReply("⚠️ IA sem resposta."); return; }

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) {
      const text = msg.content?.trim() || "(sem resposta)";
      await sendReply(text);
      return;
    }

    messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* */ }

      // Destructive → ask confirmation instead of executing
      if (DESTRUCTIVE.has(tc.function.name)) {
        const summary = `${tc.function.name}(${JSON.stringify(args)})`;
        await supabaseAdmin.from("agent_pending").upsert({ phone, action: { name: tc.function.name, args } as never, summary });
        await sendReply(`⚠️ Vou executar:\n${summary}\n\nResponda *confirmar* para prosseguir ou qualquer outra coisa para cancelar.`);
        return;
      }

      const result = await execTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  await sendReply("⚠️ Loop de ferramentas excedido.");
}

export async function isAgentMaster(phone: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("kv_settings").select("value").eq("key", "agent_master_phone").maybeSingle();
  if (!data) return false;
  const master = String(data.value).replace(/\D/g, "");
  return master === phone.replace(/\D/g, "");
}
