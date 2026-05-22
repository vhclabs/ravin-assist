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

// ========== PRODUCT IMPORT ==========

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((char === "," || char === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

type ParsedProduct = {
  description: string;
  sku?: string | null;
  ncm?: string | null;
  unit?: string;
  qty_per_box?: number;
  unit_price?: number;
  ipi_pct?: number;
  stock?: number;
};

function mapHeaderRow(headers: string[], vals: string[]): ParsedProduct | null {
  const find = (...keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex((h) => h.toLowerCase().includes(k.toLowerCase()));
      if (idx >= 0 && vals[idx]) return vals[idx];
    }
    return "";
  };
  const description = find("descri", "produto", "product", "name", "nome", "item");
  if (!description) return null;
  return {
    description,
    sku: find("sku", "cod", "code", "ref") || null,
    ncm: find("ncm") || null,
    unit: find("unid", "unit", "un") || "UN",
    qty_per_box: Number(find("cx", "caixa", "box", "pack").replace(",", ".")) || 1,
    unit_price: parseFloat(find("prec", "price", "valor", "custo", "preco").replace(",", ".")) || 0,
    ipi_pct: parseFloat(find("ipi").replace(",", ".")) || 6.5,
    stock: parseInt(find("stock", "estoque", "qtd", "qty", "quant")) || 0,
  };
}

function parseProductsFromCSV(text: string): ParsedProduct[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, ""));
  return lines
    .slice(1)
    .map((line) => {
      const vals = parseCSVLine(line).map((v) => v.replace(/^["']|["']$/g, ""));
      return mapHeaderRow(headers, vals);
    })
    .filter(Boolean) as ParsedProduct[];
}

async function parseProductsFromExcel(base64: string): Promise<ParsedProduct[]> {
  try {
    const ExcelJS = await import("exceljs");
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const workbook = new ExcelJS.default.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? "")));
    const rows: ParsedProduct[] = [];
    sheet.eachRow((row, idx) => {
      if (idx === 1) return;
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => vals.push(String(cell.value ?? "")));
      const p = mapHeaderRow(headers, vals);
      if (p) rows.push(p);
    });
    return rows;
  } catch (e) {
    console.error("Excel parse error", e);
    return [];
  }
}

async function extractProductsWithAI(base64: string, mimetype: string): Promise<ParsedProduct[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];
  const prompt = `Extraia todos os produtos desta imagem/documento e retorne SOMENTE um array JSON válido, sem explicações. Cada objeto deve ter: description (obrigatório), sku, stock, unit_price, unit, ncm, ipi_pct, qty_per_box. Exemplo: [{"description":"Vinho Malbec 750ml","sku":"MAL001","stock":100,"unit_price":45.90,"unit":"UN"}]`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim() || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as ParsedProduct[];
  } catch (e) {
    console.error("AI product extract error", e);
    return [];
  }
}

export const importProducts = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((i: unknown) =>
    z
      .object({
        filename: z.string(),
        content: z.string().max(8_000_000), // ~6MB base64
        mimetype: z.string(),
      })
      .parse(i)
  )
  .handler(async ({ data }) => {
    const { filename, content, mimetype } = data;
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    const isImage = mimetype.startsWith("image/");
    const isPdf = ext === "pdf" || mimetype === "application/pdf";
    const isCsv = ext === "csv" || mimetype === "text/csv" || mimetype === "text/plain";
    const isExcel = ext === "xlsx" || ext === "xls" || mimetype.includes("spreadsheet") || mimetype.includes("excel");

    let rows: ParsedProduct[] = [];
    if (isImage || isPdf) {
      rows = await extractProductsWithAI(content, mimetype);
    } else if (isCsv) {
      // content may be raw CSV text or base64 — try decode first, fall back to raw
      let text = content;
      try { text = atob(content); } catch { /* raw text */ }
      rows = parseProductsFromCSV(text);
    } else if (isExcel) {
      rows = await parseProductsFromExcel(content);
    } else {
      throw new Error("Formato não suportado. Use CSV, Excel (.xlsx), imagem ou PDF.");
    }

    if (!rows.length) throw new Error("Nenhum produto encontrado no arquivo.");

    let inserted = 0, updated = 0, errors = 0;
    for (const row of rows) {
      if (!row.description?.trim()) continue;
      const payload = {
        description: row.description.trim(),
        sku: row.sku || null,
        ncm: row.ncm || null,
        unit: row.unit || "UN",
        qty_per_box: row.qty_per_box || 1,
        unit_price: row.unit_price || 0,
        ipi_pct: row.ipi_pct ?? 6.5,
        stock: row.stock || 0,
        active: true,
      };
      if (payload.sku) {
        const { data: existing } = await supabaseAdmin.from("products").select("id").eq("sku", payload.sku).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("products").update(payload).eq("id", existing.id);
          error ? errors++ : updated++;
          continue;
        }
      }
      const { error } = await supabaseAdmin.from("products").insert(payload);
      error ? errors++ : inserted++;
    }

    return { inserted, updated, errors, total: rows.length };
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
