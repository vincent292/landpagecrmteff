import { supabaseAdminRequest } from "../supabase/admin";
import type { IncomingWhatsAppMessage, WhatsAppStatusEvent } from "./webhook";

export type ServerCrmConversation = {
  id: string;
  contact_id: string;
  ai_enabled: boolean;
  needs_human: boolean;
  unread_count: number;
  customer_service_window_expires_at: string | null;
  appointment_reservation_id: string | null;
};

type ServerCrmContact = {
  id: string;
  wa_id: string;
  full_name: string | null;
  phone: string;
};

export async function persistInboundMessage(message: IncomingWhatsAppMessage) {
  const now = message.timestamp
    ? new Date(Number(message.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const contactPayload: Record<string, unknown> = {
    wa_id: message.from,
    phone: message.from,
    last_message_at: now,
    updated_at: new Date().toISOString(),
  };
  if (message.contactName) contactPayload.full_name = message.contactName;

  const contacts = await supabaseAdminRequest<ServerCrmContact[]>(
    "crm_contacts?on_conflict=wa_id&select=id,wa_id,full_name,phone",
    { method: "POST", body: JSON.stringify(contactPayload), prefer: "resolution=merge-duplicates,return=representation" }
  );
  const contact = contacts[0];
  if (!contact) throw new Error("Unable to persist WhatsApp contact.");

  let conversations = await supabaseAdminRequest<ServerCrmConversation[]>(
    `crm_conversations?contact_id=eq.${encodeURIComponent(contact.id)}&select=*&limit=1`
  );
  if (!conversations[0]) {
    try {
      conversations = await supabaseAdminRequest<ServerCrmConversation[]>("crm_conversations?select=*", {
        method: "POST",
        body: JSON.stringify({ contact_id: contact.id }),
        prefer: "return=representation",
      });
    } catch {
      conversations = await supabaseAdminRequest<ServerCrmConversation[]>(
        `crm_conversations?contact_id=eq.${encodeURIComponent(contact.id)}&select=*&limit=1`
      );
    }
  }
  const conversation = conversations[0];
  if (!conversation) throw new Error("Unable to persist WhatsApp conversation.");

  const inserted = await supabaseAdminRequest<Array<{ id: string }>>(
    "crm_messages?on_conflict=meta_message_id&select=id",
    {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversation.id,
        meta_message_id: message.id ?? null,
        direction: "inbound",
        sender_type: "contact",
        message_type: message.type,
        body: message.text ?? null,
        media_id: message.mediaId ?? null,
        media_mime_type: message.mimeType ?? null,
        media_filename: message.filename ?? null,
        reply_to_meta_message_id: message.replyToMessageId ?? null,
        status: "received",
        occurred_at: now,
        raw_payload: message.raw,
      }),
      prefer: "resolution=ignore-duplicates,return=representation",
    }
  );

  if (!inserted.length) return { duplicate: true, contact, conversation };

  const preview = (message.text || `[${message.type}]`).slice(0, 180);
  const windowExpires = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const handoff = /\b(humano|persona|administradora|reclamo|emergencia)\b/i.test(message.text ?? "");
  const updated = await supabaseAdminRequest<ServerCrmConversation[]>(
    `crm_conversations?id=eq.${encodeURIComponent(conversation.id)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "abierta",
        last_message_preview: preview,
        last_message_at: now,
        last_inbound_at: now,
        customer_service_window_expires_at: windowExpires,
        unread_count: (conversation.unread_count || 0) + 1,
        needs_human: handoff || conversation.needs_human,
        updated_at: new Date().toISOString(),
      }),
      prefer: "return=representation",
    }
  );

  return { duplicate: false, contact, conversation: updated[0] ?? conversation };
}

export async function applyWhatsAppStatus(status: WhatsAppStatusEvent) {
  if (!status.id) return;
  const error = status.errors?.[0];
  await supabaseAdminRequest(
    `crm_messages?meta_message_id=eq.${encodeURIComponent(status.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: status.status,
        error_code: error?.code ? String(error.code) : null,
        error_detail: error?.message || error?.title || null,
      }),
    }
  );
}

export async function getConversationMessages(conversationId: string) {
  return supabaseAdminRequest<Array<{ direction: "inbound" | "outbound"; sender_type: string; body: string | null }>>(
    `crm_messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=direction,sender_type,body&order=occurred_at.desc&limit=18`
  ).then((rows) => rows.reverse());
}

export async function getCrmAiSettings() {
  const [settings, sources] = await Promise.all([
    supabaseAdminRequest<Array<{ ai_enabled: boolean; ai_system_prompt: string | null; booking_url: string }>>(
      "crm_settings?id=eq.true&select=ai_enabled,ai_system_prompt,booking_url&limit=1"
    ),
    supabaseAdminRequest<Array<{ title: string; content: string }>>(
      "crm_knowledge_sources?is_active=eq.true&select=title,content&order=updated_at.desc&limit=40"
    ),
  ]);
  return {
    settings: settings[0] ?? { ai_enabled: true, ai_system_prompt: null, booking_url: "/reservar-cita" },
    knowledge: sources.map((source) => `## ${source.title}\n${source.content}`).join("\n\n"),
  };
}

export async function persistOutboundMessage(input: {
  conversationId: string;
  metaMessageId?: string | null;
  body: string;
  senderType: "agent" | "ai" | "system";
  senderProfileId?: string | null;
  messageType?: string;
}) {
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdminRequest("crm_messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: input.conversationId,
        meta_message_id: input.metaMessageId ?? null,
        direction: "outbound",
        sender_type: input.senderType,
        sender_profile_id: input.senderProfileId ?? null,
        message_type: input.messageType ?? "text",
        body: input.body,
        status: "sent",
        occurred_at: now,
      }),
    }),
    supabaseAdminRequest(`crm_conversations?id=eq.${encodeURIComponent(input.conversationId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_message_preview: input.body.slice(0, 180),
        last_message_at: now,
        last_outbound_at: now,
        updated_at: now,
      }),
    }),
  ]);
}
