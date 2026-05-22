// Helpers for Evolution API (server-only).
const BASE_URL = (() => {
  const u = process.env.EVOLUTION_API_URL || "";
  return u.endsWith("/") ? u.slice(0, -1) : u;
})();

function apiKey() {
  const k = process.env.EVOLUTION_API_KEY;
  if (!k) throw new Error("EVOLUTION_API_KEY não configurada.");
  return k;
}

function url(path: string) {
  if (!BASE_URL) throw new Error("EVOLUTION_API_URL não configurada.");
  return `${BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
}

async function evo<T = unknown>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: token || apiKey(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Evolution API ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body as T;
}

// Stable URLs — use dev URL when resetting from Lovable preview, published URL in production.
const STABLE_PUBLISHED_URL = "https://ravin-assist.lovable.app";
const STABLE_DEV_URL = "https://project--2e75a4bc-97c7-4f19-bf96-96d6499954a3-dev.lovable.app";

export function getWebhookUrl(originUrl?: string) {
  const isPreviewOrigin = originUrl?.includes("lovableproject.com") || originUrl?.includes("id-preview--");
  const base = process.env.SITE_URL || (isPreviewOrigin ? STABLE_DEV_URL : STABLE_PUBLISHED_URL) || originUrl || "";
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN || "ravin";
  return `${base.replace(/\/$/, "")}/api/public/wa/webhook?token=${token}`;
}

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

export async function createInstance(name: string, webhookUrl: string) {
  // Evolution v2 endpoint
  const body = {
    instanceName: name,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: WEBHOOK_EVENTS,
    },
  };
  return await evo<{ instance: { instanceName: string }; hash?: { apikey?: string } | string; qrcode?: { base64?: string; code?: string } }>(
    `/instance/create`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function setWebhook(name: string, webhookUrl: string, token?: string) {
  // Evolution v2: PUT/POST /webhook/set/{instance}
  return await evo(
    `/webhook/set/${encodeURIComponent(name)}`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: WEBHOOK_EVENTS,
        },
      }),
    },
    token
  );
}

export async function getBase64FromMedia(name: string, messageKeyId: string, token?: string) {
  // Evolution v2: POST /chat/getBase64FromMediaMessage/{instance}
  return await evo<{ base64?: string; mediaType?: string; mimetype?: string; fileName?: string }>(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(name)}`,
    {
      method: "POST",
      body: JSON.stringify({ message: { key: { id: messageKeyId } }, convertToMp4: false }),
    },
    token
  );
}

export async function connectInstance(name: string, token?: string) {
  return await evo<{ base64?: string; code?: string; pairingCode?: string }>(
    `/instance/connect/${encodeURIComponent(name)}`,
    { method: "GET" },
    token
  );
}

export async function instanceState(name: string, token?: string) {
  return await evo<{ instance?: { state?: string } }>(
    `/instance/connectionState/${encodeURIComponent(name)}`,
    { method: "GET" },
    token
  );
}

export async function deleteInstance(name: string, token?: string) {
  return await evo(`/instance/delete/${encodeURIComponent(name)}`, { method: "DELETE" }, token);
}

export async function logoutInstance(name: string, token?: string) {
  return await evo(`/instance/logout/${encodeURIComponent(name)}`, { method: "DELETE" }, token);
}

export async function sendText(name: string, number: string, text: string, token?: string) {
  return await evo(
    `/message/sendText/${encodeURIComponent(name)}`,
    {
      method: "POST",
      body: JSON.stringify({ number, text }),
    },
    token
  );
}
