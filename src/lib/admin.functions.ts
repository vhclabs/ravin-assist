// Admin server functions: products, users, email recipients/templates, WA instances.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRavinAuth, requireMaster } from "./ravin-auth";
import {
  createInstance,
  connectInstance,
  deleteInstance,
  logoutInstance,
  instanceState,
  getWebhookUrl,
  setWebhook,
} from "./evolution.server";
import { getRequestHost } from "@tanstack/react-start/server";

// ========== PRODUCTS ==========
const productSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().max(80).nullable().optional(),
  description: z.string().min(1).max(500),
  ncm: z.string().max(20).nullable().optional(),
  unit: z.string().max(10).default("UN"),
  qty_per_box: z.number().int().min(1).max(100000).default(1),
  unit_price: z.number().min(0).max(1_000_000),
  ipi_pct: z.number().min(0).max(100).default(6.5),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("description", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => productSchema.parse(i))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("products").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("products").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== USERS ==========
const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  passcode: z.string().min(4).max(200),
  role: z.enum(["master", "vendedor"]).default("vendedor"),
  active: z.boolean().default(true),
});

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select("id,name,role,active,created_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertUser = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((i) => userSchema.parse(i))
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("app_users").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("app_users").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("app_users").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== EMAIL RECIPIENTS & TEMPLATES ==========
export const listRecipients = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("email_recipients")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertRecipient = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        email: z.string().email().max(200),
        tags: z.array(z.string().max(40)).max(10).default([]),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("email_recipients").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("email_recipients")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteRecipient = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("email_recipients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin.from("email_templates").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin.from("email_templates").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("email_templates").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ========== WHATSAPP INSTANCES ==========
function originFromRequest() {
  try {
    const host = getRequestHost();
    return host ? `https://${host}` : "";
  } catch {
    return "";
  }
}

export const listInstances = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("wa_instances")
      .select("id,instance_name,status,phone_number,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createWaInstance = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-zA-Z0-9_-]+$/, "Use apenas letras, números, hífen e underscore."),
      })
      .parse(i)
  )
  .handler(async ({ data, context }) => {
    const webhook = getWebhookUrl(originFromRequest());
    const result = await createInstance(data.name, webhook);
    const token =
      typeof result.hash === "string"
        ? result.hash
        : (result.hash && typeof result.hash === "object" && (result.hash as { apikey?: string }).apikey) || null;

    const { error } = await supabaseAdmin.from("wa_instances").insert({
      instance_name: data.name,
      api_token: token,
      status: "conectando",
      owner_id: context.user.id,
    });
    if (error) throw new Error(error.message);

    return {
      ok: true,
      name: data.name,
      qrcode: result.qrcode?.base64 || null,
    };
  });

export const refreshQrCode = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ name: z.string().min(2).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const { data: inst } = await supabaseAdmin
      .from("wa_instances")
      .select("api_token")
      .eq("instance_name", data.name)
      .maybeSingle();
    const token = inst?.api_token || undefined;

    const state = await instanceState(data.name, token);
    const s = state?.instance?.state;
    if (s === "open") {
      await supabaseAdmin
        .from("wa_instances")
        .update({ status: "conectado" })
        .eq("instance_name", data.name);
      return { connected: true, qrcode: null };
    }
    const conn = await connectInstance(data.name, token);
    return { connected: false, qrcode: conn.base64 || null, code: conn.code || null };
  });

export const removeWaInstance = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ name: z.string().min(2).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const { data: inst } = await supabaseAdmin
      .from("wa_instances")
      .select("api_token")
      .eq("instance_name", data.name)
      .maybeSingle();
    const token = inst?.api_token || undefined;
    try { await logoutInstance(data.name, token); } catch { /* ignore */ }
    try { await deleteInstance(data.name, token); } catch { /* ignore */ }
    await supabaseAdmin.from("wa_instances").delete().eq("instance_name", data.name);
    return { ok: true };
  });

export const resetWaWebhook = createServerFn({ method: "POST" })
  .middleware([requireRavinAuth])
  .inputValidator((i) => z.object({ name: z.string().min(2).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const { data: inst } = await supabaseAdmin
      .from("wa_instances")
      .select("api_token")
      .eq("instance_name", data.name)
      .maybeSingle();
    const token = inst?.api_token || undefined;
    const webhook = getWebhookUrl(originFromRequest());
    await setWebhook(data.name, webhook, token);
    return { ok: true, webhook };
  });

export const listWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("webhook_logs")
      .select("id,created_at,level,source,event,instance_name,phone,message_id,stage,summary,details")
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
