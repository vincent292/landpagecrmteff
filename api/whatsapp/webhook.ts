import { verifyMetaSignature } from "../../lib/whatsapp/meta-signature";
import { sendWhatsAppTextMessage } from "../../lib/whatsapp/send-message";
import { extractIncomingWhatsAppMessages, hasProcessedMessagePersistently } from "../../lib/whatsapp/webhook";

export const runtime = "nodejs";

const AUTO_REPLY_TEXT = "¡Hola! 👋 El asistente de WhatsApp está funcionando correctamente.";

function json(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function getVerifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN?.trim();
}

function safePreview(value?: string) {
  if (!value) return "";

  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedVerifyToken = getVerifyToken();

  if (!mode || !verifyToken || !challenge) {
    return new Response("Missing verification parameters.", { status: 400 });
  }

  if (!expectedVerifyToken) {
    console.error("[whatsapp] WHATSAPP_VERIFY_TOKEN is not configured.");
    return new Response("Webhook verification token is not configured.", { status: 500 });
  }

  if (mode === "subscribe" && verifyToken === expectedVerifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return new Response("Forbidden.", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const signatureResult = verifyMetaSignature(rawBody, signature);

  if (signatureResult.configured && signature && !signatureResult.valid) {
    console.warn("[whatsapp] Invalid Meta webhook signature.", { reason: signatureResult.reason });
    return json({ ok: false }, { status: 403 });
  }

  if (signatureResult.configured && !signature) {
    console.info("[whatsapp] Meta webhook signature not provided; continuing in phase 1.");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[whatsapp] Received invalid JSON webhook payload.");
    return json({ ok: false }, { status: 400 });
  }

  const { textMessages, unsupportedMessages, statusEventCount } = extractIncomingWhatsAppMessages(payload);
  const processedMessageIds = new Set<string>();
  let repliesSent = 0;

  if (statusEventCount > 0 && textMessages.length === 0 && unsupportedMessages.length === 0) {
    console.info("[whatsapp] Ignored status-only webhook event.", { statusEventCount });
  }

  for (const message of unsupportedMessages) {
    console.info("[whatsapp] Unsupported inbound message type.", {
      from: message.from,
      contactName: message.contactName,
      messageId: message.id,
      timestamp: message.timestamp,
      type: message.type,
    });
  }

  for (const message of textMessages) {
    if (message.id && processedMessageIds.has(message.id)) {
      console.info("[whatsapp] Duplicate message ignored in current webhook execution.", {
        messageId: message.id,
      });
      continue;
    }

    if (message.id) {
      processedMessageIds.add(message.id);
    }

    if (message.id && (await hasProcessedMessagePersistently(message.id))) {
      console.info("[whatsapp] Duplicate message ignored by persistent idempotency check.", {
        messageId: message.id,
      });
      continue;
    }

    console.info("[whatsapp] Inbound text message received.", {
      from: message.from,
      contactName: message.contactName,
      messageId: message.id,
      timestamp: message.timestamp,
      type: message.type,
      textPreview: safePreview(message.text),
      textLength: message.text?.length ?? 0,
    });

    try {
      await sendWhatsAppTextMessage({
        to: message.from,
        body: AUTO_REPLY_TEXT,
      });
      repliesSent += 1;
    } catch (error) {
      console.error("[whatsapp] Failed to send automatic reply.", {
        messageId: message.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return json({
    ok: true,
    receivedTextMessages: textMessages.length,
    unsupportedMessages: unsupportedMessages.length,
    statusEventCount,
    repliesSent,
  });
}
