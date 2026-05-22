// Public webhook for Evolution API events. Protected by ?token query param.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgent, isAgentMaster } from "@/lib/ai-agent.server";
import { getBase64FromMedia } from "@/lib/evolution.server";

type WebhookLog = {
  level?: "info" | "warn" | "error" | "success";
  event?: string;
  instanceName?: string;
  phone?: string;
  messageId?: string | null;
  stage: string;
  summary: string;
  details?: Record<string, unknown>;
};

function compactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 3).map(compactPayload);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (lower.includes("base64") || lower.includes("thumbnail") || lower.includes("jpeg")) {
      out[key] = "[omitido]";
    } else if (typeof raw === "string" && raw.length > 800) {
      out[key] = `${raw.slice(0, 800)}…`;
    } else {
      out[key] = compactPayload(raw);
    }
  }
  return out;
}

async function logWebhook(entry: WebhookLog) {
  const payload = {
    level: entry.level || "info",
    source: "whatsapp",
    event: entry.event || null,
    instance_name: entry.instanceName || null,
    phone: entry.phone || null,
    message_id: entry.messageId || null,
    stage: entry.stage,
    summary: entry.summary,
    details: compactPayload(entry.details || {}) as never,
  };
  const line = `[WA:${payload.level}] ${entry.stage} ${entry.phone || "-"} ${entry.summary}`;
  if (payload.level === "error") console.error(line, payload.details);
  else console.log(line, payload.details);
  try {
    await (supabaseAdmin as any).from("webhook_logs").insert(payload);
  } catch (error) {
    console.error("Webhook log insert failed", error);
  }
}

function normalizeMessageData(raw: unknown): Record<string, any> | null {
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, any>;
  if (obj.message && obj.key) return obj;
  if (Array.isArray(obj.messages) && obj.messages[0]) return obj.messages[0];
  return obj;
}

function extractMessage(message: Record<string, any> | undefined): Record<string, any> | undefined {
  let current = message;
  for (let i = 0; i < 5; i++) {
    if (!current) return undefined;
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else break;
  }
  return current;
}

// Transcribe audio via Lovable AI Gateway (Gemini supports audio input).
async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  // Map WhatsApp ogg/opus → "ogg" format expected by gateway.
  let format = "ogg";
  if (mimetype.includes("mp3") || mimetype.includes("mpeg")) format = "mp3";
  else if (mimetype.includes("wav")) format = "wav";
  else if (mimetype.includes("mp4") || mimetype.includes("m4a")) format = "mp4";
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
              { type: "text", text: "Transcreva fielmente este áudio em português do Brasil. Responda APENAS com a transcrição, sem comentários." },
              { type: "input_audio", input_audio: { data: base64, format } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("Transcribe failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("Transcribe error", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/wa/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const expected = process.env.EVOLUTION_WEBHOOK_TOKEN || "ravin";
        if (!token || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const event = String(body.event || "").toUpperCase().replace(/[.-]/g, "_");
        const instanceName = String(body.instance || "");
        await logWebhook({
          event,
          instanceName,
          stage: "received",
          summary: `Evento recebido: ${event || "sem_evento"}`,
          details: { keys: Object.keys(body), payload: body },
        });

        try {
          if (event === "CONNECTION_UPDATE") {
            const data = (body.data || {}) as { state?: string; wuid?: string };
            const state = data.state;
            let status: "conectado" | "desconectado" | "conectando" | "erro" = "conectando";
            if (state === "open") status = "conectado";
            else if (state === "close") status = "desconectado";
            else if (state === "connecting") status = "conectando";
            const phone = data.wuid ? String(data.wuid).split("@")[0] : null;
            await supabaseAdmin
              .from("wa_instances")
              .update({ status, phone_number: phone ?? undefined })
              .eq("instance_name", instanceName);
          } else if (event === "MESSAGES_UPSERT") {
            const data = normalizeMessageData(body.data) as {
              key?: { remoteJid?: string; fromMe?: boolean; id?: string };
              message?: {
                conversation?: string;
                extendedTextMessage?: { text?: string };
                audioMessage?: { mimetype?: string; seconds?: number };
                imageMessage?: { caption?: string };
              };
              messageTimestamp?: number;
              pushName?: string;
            };
            if (!data) {
              await logWebhook({ level: "warn", event, instanceName, stage: "ignored", summary: "Payload de mensagem vazio ou inválido", details: { data: body.data } });
              return new Response("ignored", { status: 200 });
            }
            const message = extractMessage(data.message as Record<string, any> | undefined);
            const jid = data.key?.remoteJid || "";
            const fromMe = !!data.key?.fromMe;
            if (!jid || jid.endsWith("@g.us")) {
              console.log("WA webhook ignored", { reason: !jid ? "missing_jid" : "group", event, instanceName });
              await logWebhook({ level: "warn", event, instanceName, stage: "ignored", summary: !jid ? "Mensagem sem JID" : "Mensagem de grupo ignorada", details: { key: data.key } });
              return new Response("ignored", { status: 200 });
            }
            const phone = jid.split("@")[0].replace(/\D/g, "");
            const messageId = data.key?.id || null;

            let messageType: "text" | "audio" | "image" | "other" = "text";
            let content =
              message?.conversation ||
              message?.extendedTextMessage?.text ||
              message?.imageMessage?.caption ||
              "";
            await logWebhook({ event, instanceName, phone, messageId, stage: "message_parsed", summary: `Mensagem ${fromMe ? "enviada" : "recebida"} detectada`, details: { fromMe, jid, messageKeys: Object.keys(message || {}) } });

            // Audio: download + transcribe
            if (message?.audioMessage && messageId) {
              messageType = "audio";
              try {
                await logWebhook({ event, instanceName, phone, messageId, stage: "audio_download_start", summary: "Baixando áudio da Evolution API", details: { mimetype: message.audioMessage.mimetype, seconds: message.audioMessage.seconds } });
                const { data: inst } = await supabaseAdmin
                  .from("wa_instances")
                  .select("api_token")
                  .eq("instance_name", instanceName)
                  .maybeSingle();
                const media = await getBase64FromMedia(instanceName, messageId, inst?.api_token || undefined);
                if (media?.base64) {
                  await logWebhook({ event, instanceName, phone, messageId, stage: "audio_download_ok", summary: "Áudio baixado; iniciando transcrição", details: { mimetype: media.mimetype || message.audioMessage.mimetype, mediaType: media.mediaType, base64Length: media.base64.length } });
                  const transcript = await transcribeAudio(
                    media.base64,
                    media.mimetype || message.audioMessage.mimetype || "audio/ogg"
                  );
                  if (transcript) {
                    content = `[áudio] ${transcript}`;
                    await logWebhook({ level: "success", event, instanceName, phone, messageId, stage: "audio_transcribed", summary: transcript.slice(0, 220), details: { transcript } });
                  } else {
                    content = "[áudio recebido — não foi possível transcrever]";
                    await logWebhook({ level: "error", event, instanceName, phone, messageId, stage: "audio_transcribe_empty", summary: "Transcrição retornou vazia", details: {} });
                  }
                } else {
                  content = "[áudio recebido]";
                  await logWebhook({ level: "error", event, instanceName, phone, messageId, stage: "audio_download_empty", summary: "Evolution não retornou base64 do áudio", details: { media } });
                }
              } catch (e) {
                console.error("Audio download/transcribe error", e);
                content = "[áudio recebido — erro ao processar]";
                await logWebhook({ level: "error", event, instanceName, phone, messageId, stage: "audio_error", summary: (e as Error).message || "Erro ao processar áudio", details: { error: String(e) } });
              }
            } else if (message?.imageMessage) {
              messageType = "image";
              if (!content) content = "[imagem recebida]";
            } else if (!content) {
              messageType = "other";
              content = "(mídia não suportada)";
            }

            const ts = data.messageTimestamp
              ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
              : new Date().toISOString();

            // Find or create lead by phone
            let { data: lead } = await supabaseAdmin
              .from("leads")
              .select("id,unread_count,name")
              .eq("phone", phone)
              .maybeSingle();

            if (!lead && !fromMe) {
              const { data: newLead, error: leadError } = await supabaseAdmin
                .from("leads")
                .insert({
                  phone,
                  name: data.pushName || `Lead ${phone.slice(-4)}`,
                  origin: "whatsapp",
                  status: "novo",
                  unread_count: 0,
                  last_interaction_at: ts,
                })
                .select("id,unread_count,name")
                .single();
              if (leadError) console.error("Lead create error", leadError);
              lead = newLead;
              await logWebhook({ level: leadError ? "error" : "success", event, instanceName, phone, messageId, stage: "lead_created", summary: leadError ? `Erro ao criar lead: ${leadError.message}` : `Lead criado: ${newLead?.name || phone}`, details: { leadError, leadId: newLead?.id } });
            } else if (lead) {
              await logWebhook({ event, instanceName, phone, messageId, stage: "lead_found", summary: `Lead encontrado: ${lead.name || phone}`, details: { leadId: lead.id, unread: lead.unread_count } });
            }

            if (lead) {
              const { error: msgError } = await supabaseAdmin.from("wa_messages").insert({
                instance_name: instanceName,
                lead_id: lead.id,
                remote_jid: jid,
                direction: fromMe ? "out" : "in",
                message_id: messageId,
                content,
                message_type: messageType,
                timestamp: ts,
                raw: body as never,
              });
              await logWebhook({ level: msgError ? "error" : "success", event, instanceName, phone, messageId, stage: "message_saved", summary: msgError ? `Erro ao salvar mensagem: ${msgError.message}` : `Mensagem salva (${messageType})`, details: { msgError, content } });

              if (!fromMe) {
                await supabaseAdmin
                  .from("leads")
                  .update({ last_interaction_at: ts, unread_count: (lead.unread_count || 0) + 1 })
                  .eq("id", lead.id);
              } else {
                await supabaseAdmin
                  .from("leads")
                  .update({ last_interaction_at: ts })
                  .eq("id", lead.id);
              }

              // Trigger AI agent if message is from the master phone (Denis) and not fromMe.
              // For all other senders we just record the lead/message (handled above).
              if (!fromMe && (await isAgentMaster(phone))) {
                try {
                  await logWebhook({ event, instanceName, phone, messageId, stage: "agent_start", summary: "Mensagem é do Denis; acionando Jarvis", details: { content } });
                  // Strip "[áudio] " prefix when passing to agent so it acts naturally.
                  const agentContent = content.startsWith("[áudio] ") ? content.slice(8) : content;
                  await runAgent({ instanceName, phone, jid, content: agentContent });
                  await logWebhook({ level: "success", event, instanceName, phone, messageId, stage: "agent_done", summary: "Jarvis executou e tentou responder", details: { agentContent } });
                } catch (e) {
                  console.error("Agent error:", e);
                  await logWebhook({ level: "error", event, instanceName, phone, messageId, stage: "agent_error", summary: (e as Error).message || "Erro no Jarvis", details: { error: String(e) } });
                }
              } else if (!fromMe) {
                await logWebhook({ event, instanceName, phone, messageId, stage: "agent_skipped", summary: "Não é o número master; só registrei como lead/mensagem", details: {} });
              }
            } else {
              await logWebhook({ level: "warn", event, instanceName, phone, messageId, stage: "no_lead", summary: "Mensagem não foi associada a lead", details: { fromMe } });
            }
          }
        } catch (e) {
          console.error("Webhook error:", e);
          await logWebhook({ level: "error", event, instanceName, stage: "fatal_error", summary: (e as Error).message || "Erro geral no webhook", details: { error: String(e) } });
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok"),
    },
  },
});
