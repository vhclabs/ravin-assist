// Public webhook for Evolution API events. Protected by ?token query param.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgent, isAgentMaster } from "@/lib/ai-agent.server";
import { getBase64FromMedia } from "@/lib/evolution.server";

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
            const data = (body.data || {}) as {
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
            const jid = data.key?.remoteJid || "";
            const fromMe = !!data.key?.fromMe;
            if (!jid || jid.endsWith("@g.us")) {
              console.log("WA webhook ignored", { reason: !jid ? "missing_jid" : "group", event, instanceName });
              return new Response("ignored", { status: 200 });
            }
            const phone = jid.split("@")[0].replace(/\D/g, "");
            const messageId = data.key?.id || null;

            let messageType: "text" | "audio" | "image" | "other" = "text";
            let content =
              data.message?.conversation ||
              data.message?.extendedTextMessage?.text ||
              data.message?.imageMessage?.caption ||
              "";

            // Audio: download + transcribe
            if (data.message?.audioMessage && messageId) {
              messageType = "audio";
              try {
                const { data: inst } = await supabaseAdmin
                  .from("wa_instances")
                  .select("api_token")
                  .eq("instance_name", instanceName)
                  .maybeSingle();
                const media = await getBase64FromMedia(instanceName, messageId, inst?.api_token || undefined);
                if (media?.base64) {
                  const transcript = await transcribeAudio(
                    media.base64,
                    media.mimetype || data.message.audioMessage.mimetype || "audio/ogg"
                  );
                  if (transcript) content = `[áudio] ${transcript}`;
                  else content = "[áudio recebido — não foi possível transcrever]";
                } else {
                  content = "[áudio recebido]";
                }
              } catch (e) {
                console.error("Audio download/transcribe error", e);
                content = "[áudio recebido — erro ao processar]";
              }
            } else if (data.message?.imageMessage) {
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
            }

            if (lead) {
              await supabaseAdmin.from("wa_messages").insert({
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
                  // Strip "[áudio] " prefix when passing to agent so it acts naturally.
                  const agentContent = content.startsWith("[áudio] ") ? content.slice(8) : content;
                  await runAgent({ instanceName, phone, jid, content: agentContent });
                } catch (e) {
                  console.error("Agent error:", e);
                }
              }
            }
          }
        } catch (e) {
          console.error("Webhook error:", e);
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok"),
    },
  },
});
