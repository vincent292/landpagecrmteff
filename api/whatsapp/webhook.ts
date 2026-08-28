import { waitUntil } from "@vercel/functions";

import { verifyMetaSignature } from "../../lib/whatsapp/meta-signature";
import { sendWhatsAppTextMessage } from "../../lib/whatsapp/send-message";
import { extractIncomingWhatsAppMessages } from "../../lib/whatsapp/webhook";
import {
  applyWhatsAppStatus,
  getConversationMessages,
  getCrmAiSettings,
  persistInboundMessage,
  persistOutboundMessage,
} from "../../lib/whatsapp/crm";
import { generateGeminiCrmReply } from "../../lib/whatsapp/gemini";

export const runtime = "nodejs";

function json(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (!mode || !verifyToken || !challenge) return new Response("Missing verification parameters.", { status: 400 });
  if (!expectedVerifyToken) return new Response("Webhook verification token is not configured.", { status: 500 });
  if (mode === "subscribe" && verifyToken === expectedVerifyToken) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden.", { status: 403 });
}

async function answerWithAi(input: {
  conversationId: string;
  contactName: string | null;
  to: string;
  knowledge: string;
  settings: { booking_url: string; ai_system_prompt: string | null };
}) {
  const history = await getConversationMessages(input.conversationId);
  const aiReply = await generateGeminiCrmReply({
    contactName: input.contactName,
    messages: history,
    knowledge: input.knowledge,
    bookingUrl: input.settings.booking_url,
    customSystemPrompt: input.settings.ai_system_prompt,
  });
  const metaResponse = await sendWhatsAppTextMessage({ to: input.to, body: aiReply });
  await persistOutboundMessage({
    conversationId: input.conversationId,
    metaMessageId: metaResponse?.messages?.[0]?.id ?? null,
    body: aiReply,
    senderType: "ai",
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureResult = verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"));

  if (signatureResult.configured && !signatureResult.valid) {
    console.warn("[whatsapp] Invalid or missing Meta webhook signature.", { reason: signatureResult.reason });
    return json({ ok: false }, { status: 403 });
  }
  if (!signatureResult.configured && process.env.NODE_ENV === "production") {
    console.error("[whatsapp] META_APP_SECRET is required in production.");
    return json({ ok: false }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  const { textMessages, unsupportedMessages, statusEvents } = extractIncomingWhatsAppMessages(payload);
  let repliesQueued = 0;
  await Promise.all(statusEvents.map((status) => applyWhatsAppStatus(status)));

  for (const message of unsupportedMessages) {
    console.info("[whatsapp] Unsupported inbound message type.", {
      from: message.from,
      messageId: message.id,
      type: message.type,
    });
  }

  for (const message of textMessages) {
    try {
      const persisted = await persistInboundMessage(message);
      if (persisted.duplicate) continue;

      const { settings, knowledge } = await getCrmAiSettings();
      if (!settings.ai_enabled || !persisted.conversation.ai_enabled || persisted.conversation.needs_human || !message.text) continue;

      waitUntil(answerWithAi({
        conversationId: persisted.conversation.id,
        contactName: persisted.contact.full_name,
        to: message.from,
        knowledge,
        settings,
      }).catch((error) => {
        console.error("[whatsapp] Deferred Gemini reply failed.", {
          messageId: message.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }));
      repliesQueued += 1;
    } catch (error) {
      console.error("[whatsapp] Failed to process inbound CRM message.", {
        messageId: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return json({
    ok: true,
    receivedMessages: textMessages.length,
    unsupportedMessages: unsupportedMessages.length,
    statusEventCount: statusEvents.length,
    repliesQueued,
  });
}
