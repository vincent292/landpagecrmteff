import {
  applyWhatsAppStatus,
  corsHeaders,
  createAdminClient,
  extractWebhookPayload,
  generateGeminiReply,
  getAiContext,
  json,
  persistInboundMessage,
  persistOutboundMessage,
  requiredEnv,
  sendMetaMessage,
  verifyMetaSignature,
} from "../_shared/whatsapp-crm.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function answerWithAi(input: {
  conversationId: string;
  contactName: string | null;
  to: string;
}) {
  const admin = createAdminClient();
  const context = await getAiContext(admin, input.conversationId);
  if (!context.settings.ai_enabled) return;
  const reply = await generateGeminiReply({
    contactName: input.contactName,
    messages: context.messages,
    knowledge: context.knowledge,
    bookingUrl: context.settings.booking_url,
    customSystemPrompt: context.settings.ai_system_prompt,
  });
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
      if (persisted.duplicate || !message.text || !persisted.conversation.ai_enabled || persisted.conversation.needs_human) continue;
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
