import {
  corsHeaders,
  json,
  persistOutboundMessage,
  recordBotLearningEvent,
  requireCrmManager,
  sendMetaMessage,
} from "../_shared/whatsapp-crm.ts";

type SendBody = {
  conversationId?: string;
  body?: string;
  imageUrl?: string;
  templateName?: string;
  languageCode?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const { admin, user } = await requireCrmManager(request);
    const input = await request.json() as SendBody;
    if (!input.conversationId || (!input.body?.trim() && !input.imageUrl?.trim() && !input.templateName?.trim())) {
      return json({ error: "conversationId y mensaje, imagen o plantilla son obligatorios." }, 400);
    }

    const { data: conversation, error: conversationError } = await admin
      .from("crm_conversations")
      .select("id,needs_human,customer_service_window_expires_at,crm_contacts(id,wa_id)")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    const embeddedContact = conversation?.crm_contacts as unknown as { id?: string; wa_id?: string } | null;
    const to = embeddedContact?.wa_id;
    if (!conversation || !to) return json({ error: "Conversación no encontrada." }, 404);

    const windowOpen = conversation.customer_service_window_expires_at
      ? new Date(conversation.customer_service_window_expires_at).getTime() > Date.now()
      : false;
    if (!windowOpen && !input.templateName) {
      return json({ error: "La ventana de 24 horas terminó. Usa una plantilla aprobada por Meta." }, 409);
    }

    const body = input.body?.trim() || (input.imageUrl ? "QR de pago" : `[Plantilla: ${input.templateName}]`);
    let metaPayload: Record<string, unknown>;
    let messageType = "text";
    if (input.templateName) {
      messageType = "template";
      metaPayload = { type: "template", template: { name: input.templateName.trim(), language: { code: input.languageCode || "es" } } };
    } else if (input.imageUrl) {
      messageType = "image";
      metaPayload = { type: "image", image: { link: input.imageUrl.trim(), ...(input.body?.trim() ? { caption: input.body.trim() } : {}) } };
    } else {
      metaPayload = { type: "text", text: { preview_url: /https?:\/\//i.test(body), body } };
    }

    const meta = await sendMetaMessage(to, metaPayload);
    await persistOutboundMessage(admin, {
      conversationId: conversation.id,
      metaMessageId: meta?.messages?.[0]?.id ?? null,
      body,
      senderType: "agent",
      senderProfileId: user.id,
      messageType,
    });
    if (conversation.needs_human && input.body?.trim() && !input.templateName) {
      const recentInbound = await admin
        .from("crm_messages")
        .select("id,body")
        .eq("conversation_id", conversation.id)
        .eq("direction", "inbound")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentInbound.error) throw recentInbound.error;
      await recordBotLearningEvent(admin, {
        conversationId: conversation.id,
        contactId: embeddedContact.id ?? null,
        crmMessageId: recentInbound.data?.id ?? null,
        eventType: "human_reply_example",
        detectedIntent: "respuesta_humana",
        userText: recentInbound.data?.body ?? null,
        botResponse: input.body.trim(),
        metadata: { sender_profile_id: user.id, source: "whatsapp-send" },
      });
    }
    return json({ ok: true, metaMessageId: meta?.messages?.[0]?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    if (message === "UNAUTHORIZED") return json({ error: "Sesión inválida." }, 401);
    if (message === "FORBIDDEN") return json({ error: "No tienes acceso al CRM." }, 403);
    console.error("[whatsapp-send] Failed", error);
    return json({ error: "No se pudo enviar el mensaje." }, 500);
  }
});
