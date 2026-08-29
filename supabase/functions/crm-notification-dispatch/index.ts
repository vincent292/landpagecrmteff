import {
  corsHeaders,
  json,
  persistOutboundMessage,
  requireCrmManager,
  sendMetaMessage,
} from "../_shared/whatsapp-crm.ts";

type OutboxRow = {
  id: string;
  conversation_id: string | null;
  recipient_wa_id: string;
  recipient_kind: "patient" | "doctor" | "admin";
  body: string;
  template_name: string | null;
  template_language: string;
  template_parameters: unknown;
  attempt_count: number;
};

function templatePayload(row: OutboxRow) {
  const parameters = Array.isArray(row.template_parameters) ? row.template_parameters : [];
  return {
    type: "template",
    template: {
      name: row.template_name,
      language: { code: row.template_language || "es" },
      ...(parameters.length ? {
        components: [{ type: "body", parameters: parameters.map((value) => ({ type: "text", text: String(value ?? "") })) }],
      } : {}),
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const { admin } = await requireCrmManager(request);
    const { data, error } = await admin
      .from("crm_notification_outbox")
      .select("*")
      .in("status", ["pending", "failed"])
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at")
      .limit(25);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    let needsTemplate = 0;
    for (const item of (data ?? []) as OutboxRow[]) {
      const claimed = await admin.from("crm_notification_outbox")
        .update({ status: "sending", attempt_count: Number(item.attempt_count ?? 0) + 1 })
        .eq("id", item.id).in("status", ["pending", "failed"])
        .select("id").maybeSingle();
      if (claimed.error || !claimed.data) continue;

      try {
        let windowOpen = false;
        let conversationId = item.conversation_id;
        if (conversationId) {
          const conversation = await admin.from("crm_conversations")
            .select("customer_service_window_expires_at")
            .eq("id", conversationId).maybeSingle();
          if (conversation.error) throw conversation.error;
          windowOpen = conversation.data?.customer_service_window_expires_at
            ? new Date(conversation.data.customer_service_window_expires_at).getTime() > Date.now()
            : false;
        } else {
          const contact = await admin.from("crm_contacts").select("id").eq("wa_id", item.recipient_wa_id).maybeSingle();
          if (contact.error) throw contact.error;
          if (contact.data) {
            const conversation = await admin.from("crm_conversations")
              .select("id,customer_service_window_expires_at")
              .eq("contact_id", contact.data.id).maybeSingle();
            if (conversation.error) throw conversation.error;
            conversationId = conversation.data?.id ?? null;
            windowOpen = conversation.data?.customer_service_window_expires_at
              ? new Date(conversation.data.customer_service_window_expires_at).getTime() > Date.now()
              : false;
          }
        }

        if (!windowOpen && !item.template_name) {
          await admin.from("crm_notification_outbox").update({
            status: "needs_template",
            last_error: `Falta una plantilla aprobada para notificar a ${item.recipient_kind} fuera de la ventana de 24 horas.`,
          }).eq("id", item.id);
          needsTemplate += 1;
          continue;
        }

        const payload = windowOpen
          ? { type: "text", text: { preview_url: false, body: item.body } }
          : templatePayload(item);
        const meta = await sendMetaMessage(item.recipient_wa_id, payload);
        const metaMessageId = meta?.messages?.[0]?.id ?? null;
        if (conversationId) {
          await persistOutboundMessage(admin, {
            conversationId,
            metaMessageId,
            body: item.body,
            senderType: "system",
            messageType: windowOpen ? "text" : "template",
          });
        }
        await admin.from("crm_notification_outbox").update({
          status: "sent", meta_message_id: metaMessageId, sent_at: new Date().toISOString(), last_error: null,
        }).eq("id", item.id);
        sent += 1;
      } catch (cause) {
        const attempt = Number(item.attempt_count ?? 0) + 1;
        const minutes = Math.min(60, Math.max(2, 2 ** attempt));
        await admin.from("crm_notification_outbox").update({
          status: "failed",
          last_error: cause instanceof Error ? cause.message.slice(0, 500) : "Error desconocido",
          next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString(),
        }).eq("id", item.id);
        failed += 1;
      }
    }
    return json({ ok: true, processed: (data ?? []).length, sent, failed, needsTemplate });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Error desconocido";
    if (message === "UNAUTHORIZED") return json({ error: "Sesión inválida." }, 401);
    if (message === "FORBIDDEN") return json({ error: "No tienes acceso al CRM." }, 403);
    console.error("[crm-notification-dispatch] Failed", cause);
    return json({ error: "No se pudieron procesar las notificaciones." }, 500);
  }
});
