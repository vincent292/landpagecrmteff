import { authenticateCrmRequest, supabaseAdminRequest } from "../../lib/supabase/admin";
import { persistOutboundMessage } from "../../lib/whatsapp/crm";
import { sendWhatsAppImageMessage, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "../../lib/whatsapp/send-message";

export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

type SendBody = { conversationId?: string; body?: string; imageUrl?: string; templateName?: string; languageCode?: string };

export async function POST(request: Request) {
  try {
    const actor = await authenticateCrmRequest(request);
    const input = (await request.json()) as SendBody;
    if (!input.conversationId || (!input.body?.trim() && !input.imageUrl?.trim() && !input.templateName?.trim())) {
      return json({ error: "conversationId y mensaje/plantilla son obligatorios." }, 400);
    }

    const conversations = await supabaseAdminRequest<Array<{
      id: string;
      customer_service_window_expires_at: string | null;
      crm_contacts: { wa_id: string } | null;
    }>>(`crm_conversations?id=eq.${encodeURIComponent(input.conversationId)}&select=id,customer_service_window_expires_at,crm_contacts(wa_id)&limit=1`);
    const conversation = conversations[0];
    const to = conversation?.crm_contacts?.wa_id;
    if (!conversation || !to) return json({ error: "Conversación no encontrada." }, 404);

    const windowOpen = conversation.customer_service_window_expires_at
      ? new Date(conversation.customer_service_window_expires_at).getTime() > Date.now()
      : false;
    if (!windowOpen && !input.templateName) {
      return json({ error: "La ventana de atención de 24 horas terminó. Envía una plantilla aprobada por Meta." }, 409);
    }

    const body = input.body?.trim() || (input.imageUrl ? "QR de pago" : `[Plantilla: ${input.templateName}]`);
    const metaResponse = input.templateName
      ? await sendWhatsAppTemplateMessage({ to, templateName: input.templateName.trim(), languageCode: input.languageCode })
      : input.imageUrl
        ? await sendWhatsAppImageMessage({ to, imageUrl: input.imageUrl.trim(), caption: input.body?.trim() })
      : await sendWhatsAppTextMessage({ to, body });

    await persistOutboundMessage({
      conversationId: conversation.id,
      metaMessageId: metaResponse?.messages?.[0]?.id ?? null,
      body,
      senderType: "agent",
      senderProfileId: actor.id,
      messageType: input.templateName ? "template" : input.imageUrl ? "image" : "text",
    });
    return json({ ok: true, metaMessageId: metaResponse?.messages?.[0]?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    if (message === "UNAUTHORIZED") return json({ error: "Sesión inválida." }, 401);
    if (message === "FORBIDDEN") return json({ error: "No tienes acceso al CRM." }, 403);
    console.error("[whatsapp] CRM send failed", { message });
    return json({ error: "No se pudo enviar el mensaje." }, 500);
  }
}
