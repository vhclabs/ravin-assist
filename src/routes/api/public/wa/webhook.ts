// Public webhook for Evolution API events. Protected by ?token query param.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

        const event = String(body.event || "").toUpperCase();
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
              message?: { conversation?: string; extendedTextMessage?: { text?: string } };
              messageTimestamp?: number;
              pushName?: string;
            };
            const jid = data.key?.remoteJid || "";
            const fromMe = !!data.key?.fromMe;
            if (!jid || jid.endsWith("@g.us")) {
              return new Response("ignored", { status: 200 });
            }
            const phone = jid.split("@")[0].replace(/\D/g, "");
            const content =
              data.message?.conversation ||
              data.message?.extendedTextMessage?.text ||
              "(mídia não suportada)";
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
              const { data: newLead } = await supabaseAdmin
                .from("leads")
                .insert({
                  phone,
                  name: data.pushName || `Lead ${phone.slice(-4)}`,
                  origin: "whatsapp",
                  status: "novo",
                  unread_count: 1,
                  last_interaction_at: ts,
                })
                .select("id,unread_count,name")
                .single();
              lead = newLead;
            }

            if (lead) {
              await supabaseAdmin.from("wa_messages").insert({
                instance_name: instanceName,
                lead_id: lead.id,
                remote_jid: jid,
                direction: fromMe ? "out" : "in",
                message_id: data.key?.id || null,
                content,
                message_type: "text",
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
