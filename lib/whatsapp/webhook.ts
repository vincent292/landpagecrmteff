type WhatsAppContact = {
  profile?: {
    name?: string;
  };
  wa_id?: string;
};

type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  context?: { id?: string };
};

export type WhatsAppStatusEvent = {
  id?: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted";
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number | string; title?: string; message?: string }>;
};

type WhatsAppChangeValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatusEvent[];
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppChangeValue;
    }>;
  }>;
};

export type IncomingWhatsAppMessage = {
  from: string;
  contactName?: string;
  id?: string;
  timestamp?: string;
  type: string;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  replyToMessageId?: string;
  raw: Record<string, unknown>;
};

export type WebhookExtractionResult = {
  textMessages: IncomingWhatsAppMessage[];
  unsupportedMessages: IncomingWhatsAppMessage[];
  statusEvents: WhatsAppStatusEvent[];
};

function findContactName(contacts: WhatsAppContact[] | undefined, waId: string) {
  return contacts?.find((contact) => contact.wa_id === waId)?.profile?.name;
}

function toIncomingMessage(message: WhatsAppMessage, contacts?: WhatsAppContact[]): IncomingWhatsAppMessage | null {
  if (!message.from) return null;

  const text = message.text?.body
    ?? message.image?.caption
    ?? message.document?.caption
    ?? message.video?.caption
    ?? message.button?.text
    ?? message.interactive?.button_reply?.title
    ?? message.interactive?.list_reply?.title;
  const media = message.image ?? message.document ?? message.audio ?? message.video;

  return {
    from: message.from,
    contactName: findContactName(contacts, message.from),
    id: message.id,
    timestamp: message.timestamp,
    type: message.type ?? "unknown",
    text,
    mediaId: media?.id,
    mimeType: media?.mime_type,
    filename: message.document?.filename,
    replyToMessageId: message.context?.id,
    raw: message as Record<string, unknown>,
  };
}

function isWebhookPayload(payload: unknown): payload is WhatsAppWebhookPayload {
  return typeof payload === "object" && payload !== null;
}

export function extractIncomingWhatsAppMessages(payload: unknown): WebhookExtractionResult {
  const result: WebhookExtractionResult = {
    textMessages: [],
    unsupportedMessages: [],
    statusEvents: [],
  };

  if (!isWebhookPayload(payload)) return result;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      if (!value) continue;

      result.statusEvents.push(...(value.statuses ?? []));

      for (const message of value.messages ?? []) {
        const incomingMessage = toIncomingMessage(message, value.contacts);

        if (!incomingMessage) continue;

        if (["text", "image", "document", "audio", "video", "button", "interactive"].includes(incomingMessage.type)) {
          result.textMessages.push(incomingMessage);
        } else {
          result.unsupportedMessages.push(incomingMessage);
        }
      }
    }
  }

  return result;
}
