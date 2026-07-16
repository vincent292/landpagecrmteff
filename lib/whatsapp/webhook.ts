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
};

type WhatsAppChangeValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
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
};

export type WebhookExtractionResult = {
  textMessages: IncomingWhatsAppMessage[];
  unsupportedMessages: IncomingWhatsAppMessage[];
  statusEventCount: number;
};

function findContactName(contacts: WhatsAppContact[] | undefined, waId: string) {
  return contacts?.find((contact) => contact.wa_id === waId)?.profile?.name;
}

function toIncomingMessage(message: WhatsAppMessage, contacts?: WhatsAppContact[]): IncomingWhatsAppMessage | null {
  if (!message.from) return null;

  return {
    from: message.from,
    contactName: findContactName(contacts, message.from),
    id: message.id,
    timestamp: message.timestamp,
    type: message.type ?? "unknown",
    text: message.text?.body,
  };
}

function isWebhookPayload(payload: unknown): payload is WhatsAppWebhookPayload {
  return typeof payload === "object" && payload !== null;
}

export function extractIncomingWhatsAppMessages(payload: unknown): WebhookExtractionResult {
  const result: WebhookExtractionResult = {
    textMessages: [],
    unsupportedMessages: [],
    statusEventCount: 0,
  };

  if (!isWebhookPayload(payload)) return result;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      if (!value) continue;

      result.statusEventCount += value.statuses?.length ?? 0;

      for (const message of value.messages ?? []) {
        const incomingMessage = toIncomingMessage(message, value.contacts);

        if (!incomingMessage) continue;

        if (incomingMessage.type === "text" && incomingMessage.text) {
          result.textMessages.push(incomingMessage);
        } else {
          result.unsupportedMessages.push(incomingMessage);
        }
      }
    }
  }

  return result;
}

export async function hasProcessedMessagePersistently(messageId: string) {
  void messageId;
  // Phase 1 keeps idempotency in memory per request. Persist this check in Supabase later.
  return false;
}
