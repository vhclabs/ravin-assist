// CRM server functions: leads, notes, tasks, messages, AI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRavinAuth } from "./ravin-auth";
import { sendText } from "./evolution.server";

// ========== LEADS ==========
const leadStatus = z.enum(["novo", "qualificado", "proposta", "negociacao", "fechado", "perdido"]);

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("id,name,phone,company,status,owner_id,next_followup_at,last_interaction_at,unread_count,origin,created_at")
      .order("last_interaction_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const [{ data: lead }, { data: notes }, { data: tasks }, { data: messages }] = await Promise.all([
      supabaseAdmin.from("leads").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("lead_notes")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("tasks")
        .select("*")
        .eq("lead_id", data.id)
        .order("due_at", { ascending: true, nullsFirst: false }),
      supabaseAdmin
        .from("wa_messages")
        .select("*")
        .eq("lead_id", data.id)
        .order("timestamp", { ascending: true })
        .limit(500),
    ]);
    if (!lead) throw new Error("Lead não encontrado");
    // mark as read
    await supabaseAdmin.from("leads").update({ unread_count: 0 }).eq("id", data.id);
    return { lead, notes: notes ?? [], tasks: tasks ?? [], messages: messages ?? [] };
  });

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().max(160).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        company: z.string().max(160).nullable().optional(),
        cnpj: z.string().max(30).nullable().optional(),
        email: z.string().email().max(200).nullable().or(z.literal("")).optional(),
        status: leadStatus.default("novo"),
        origin: z.string().max(40).default("manual"),
        next_followup_at: z.string().nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, email: data.email || null };
    if (data.id) {
      const { error } = await supabaseAdmin.from("leads").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("leads")
      .insert({ ...payload, owner_id: context.user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), status: leadStatus }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("leads").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("lead_notes").insert({
      lead_id: data.id,
      author_id: context.user.id,
      kind: "status_change",
      content: `Status alterado para "${data.status}"`,
    });
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z.object({ lead_id: z.string().uuid(), content: z.string().min(1).max(5000) }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("lead_notes").insert({
      lead_id: data.lead_id,
      author_id: context.user.id,
      kind: "note",
      content: data.content,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== TASKS ==========
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .select("*, lead:leads(id,name,company,phone)")
      .neq("status", "concluida")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        lead_id: z.string().uuid().nullable().optional(),
        due_at: z.string().nullable().optional(),
        status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]).default("pendente"),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("tasks").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("tasks")
      .insert({ ...data, assignee_id: context.user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("tasks").update({ status: "concluida" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== WHATSAPP MESSAGES ==========
export const sendWaMessage = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        lead_id: z.string().uuid(),
        text: z.string().min(1).max(4000),
        instance_name: z.string().min(2).max(40).optional(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id,phone")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (!lead?.phone) throw new Error("Lead sem telefone cadastrado.");

    // Pick first connected instance if not specified
    let name = data.instance_name;
    let token: string | undefined;
    if (!name) {
      const { data: inst } = await supabaseAdmin
        .from("wa_instances")
        .select("instance_name,api_token")
        .eq("status", "conectado")
        .limit(1)
        .maybeSingle();
      if (!inst) throw new Error("Nenhuma instância WhatsApp conectada.");
      name = inst.instance_name;
      token = inst.api_token || undefined;
    } else {
      const { data: inst } = await supabaseAdmin
        .from("wa_instances")
        .select("api_token")
        .eq("instance_name", name)
        .maybeSingle();
      token = inst?.api_token || undefined;
    }

    const number = lead.phone.replace(/\D/g, "");
    await sendText(name, number, data.text, token);

    await supabaseAdmin.from("wa_messages").insert({
      instance_name: name,
      lead_id: lead.id,
      remote_jid: `${number}@s.whatsapp.net`,
      direction: "out",
      content: data.text,
      message_type: "text",
    });
    await supabaseAdmin
      .from("leads")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", lead.id);

    return { ok: true };
  });

// ========== AI ==========
export const aiSuggestReply = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ lead_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("name,company,status,notes")
      .eq("id", data.lead_id)
      .maybeSingle();
    const { data: msgs } = await supabaseAdmin
      .from("wa_messages")
      .select("direction,content,timestamp")
      .eq("lead_id", data.lead_id)
      .order("timestamp", { ascending: false })
      .limit(20);
    const history = (msgs ?? [])
      .reverse()
      .map((m) => `${m.direction === "in" ? "Cliente" : "Denis"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é o assistente comercial do Denis (RAVIN, importadora de vinhos).
Lead: ${lead?.name ?? "-"} (${lead?.company ?? "-"}) — status: ${lead?.status ?? "-"}.
Anotações: ${lead?.notes ?? "(nenhuma)"}.

Histórico recente:
${history || "(sem histórico)"}

Sugira em português UMA mensagem curta, cordial, objetiva e ativa (no máximo 3 linhas) para enviar agora pelo WhatsApp. Avance a conversa rumo ao fechamento. NÃO use emojis. Responda apenas com o texto da mensagem.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`IA falhou: ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() || "";
    return { text };
  });
