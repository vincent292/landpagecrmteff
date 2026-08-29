import {
  applyWhatsAppStatus,
  corsHeaders,
  createAdminClient,
  extractWebhookPayload,
  generateGeminiReply,
  getAiContext,
  getMetaAdEntryReply,
  getFastCrmReply,
  isHumanRequest,
  json,
  persistInboundMessage,
  persistOutboundMessage,
  requiredEnv,
  sendMetaMessage,
  verifyMetaSignature,
} from "../_shared/whatsapp-crm.ts";
import { handleBookingConversation } from "../_shared/whatsapp-booking.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function answerWithAi(input: {
  conversationId: string;
  contactName: string | null;
  to: string;
}) {
  const admin = createAdminClient();
  const context = await getAiContext(admin, input.conversationId);
  if (!context.settings.ai_enabled) return;
  let reply: string;
  try {
    reply = await generateGeminiReply({
      contactName: input.contactName,
      messages: context.messages,
      knowledgeSources: context.knowledgeSources,
      bookingUrl: context.settings.booking_url,
      bookingState: context.bookingState,
      metaAdContext: context.metaAdContext,
      customSystemPrompt: context.settings.ai_system_prompt,
      allowExternalGrounding: context.settings.allow_external_grounding !== false,
    });
  } catch (error) {
    console.error("[whatsapp] Gemini reply failed; sending fallback", error);
    reply = "Estoy teniendo una demora para consultar la información completa. Puedo ayudarte con información general de tratamientos o, si deseas reservar, escribe: quiero reservar una cita.";
  }
  const meta = await sendMetaMessage(input.to, {
    type: "text",
    text: { preview_url: /https?:\/\//i.test(reply), body: reply },
  });
  await persistOutboundMessage(admin, {
    conversationId: input.conversationId,
    metaMessageId: meta?.messages?.[0]?.id ?? null,
    body: reply,
    senderType: "ai",
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    let expectedToken: string;
    try {
      expectedToken = requiredEnv("WHATSAPP_VERIFY_TOKEN", "VERIFY_TOKEN");
    } catch {
      return new Response("Webhook verification token is not configured.", { status: 500 });
    }
    if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden.", { status: 403 });
  }

  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const rawBody = await request.text();
  try {
    if (!(await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256")))) {
      return json({ ok: false, error: "Firma de Meta inválida." }, 403);
    }
  } catch (error) {
    console.error("[whatsapp] Signature configuration error", error);
    return json({ ok: false, error: "Webhook no configurado." }, 503);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "JSON inválido." }, 400);
  }

  const admin = createAdminClient();
  const { incoming, unsupported, statuses } = extractWebhookPayload(payload);
  try {
    await Promise.all(statuses.map((status) => applyWhatsAppStatus(admin, status)));
  } catch (error) {
    console.error("[whatsapp] Status persistence failed", error);
  }

  let repliesQueued = 0;
  for (const message of incoming) {
    try {
      const persisted = await persistInboundMessage(admin, message);
      if (persisted.duplicate) continue;
      const bookingHandled = await handleBookingConversation(admin, persisted, message);
      if (bookingHandled || !message.text) continue;
      if (isHumanRequest(message.text)) {
        const handoff = /\b(emergencia|urgencia)\b/i.test(message.text)
          ? "Si presentas una urgencia médica, acude de inmediato al servicio de emergencias más cercano. También avisamos a administración para que pueda orientarte."
          : "Entendido. Avisé a administración para que una persona continúe contigo lo antes posible.";
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: handoff } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: handoff, senderType: "system" });
        continue;
      }
      if (!persisted.conversation.ai_enabled || persisted.conversation.needs_human) continue;
      const metaAdReply = await getMetaAdEntryReply(admin, persisted.conversation.id, message.text);
      if (metaAdReply) {
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: metaAdReply } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: metaAdReply, senderType: "ai" });
        continue;
      }
      const fastReply = await getFastCrmReply(admin, message.text);
      if (fastReply) {
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: fastReply } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: fastReply, senderType: "ai" });
        continue;
      }
      EdgeRuntime.waitUntil(answerWithAi({
        conversationId: persisted.conversation.id,
        contactName: persisted.contact.full_name,
        to: message.from,
      }).catch((error) => console.error("[whatsapp] Deferred Gemini reply failed", error)));
      repliesQueued += 1;
    } catch (error) {
      console.error("[whatsapp] Inbound persistence failed", error);
    }
  }

  return json({
    ok: true,
    receivedMessages: incoming.length,
    unsupportedMessages: unsupported.length,
    statusEventCount: statuses.length,
    repliesQueued,
  });
});
