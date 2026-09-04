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
  recordBotLearningEvent,
  requiredEnv,
  sendMetaMessage,
  verifyMetaSignature,
} from "../_shared/whatsapp-crm.ts";
import { handleBookingConversation, handleTreatmentCatalogConversation } from "../_shared/whatsapp-booking.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function isUnsafeAiReply(reply: string) {
  return /\b(without inventing|direct response|system instruction|prompt injection|contexto del negocio|estado real de reserva|redacta unicamente|ignore previous)\b/i.test(reply);
}

function digitsOnly(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function boliviaWhatsAppVariants(value: string | null | undefined) {
  const digits = digitsOnly(value);
  const variants = new Set<string>();
  if (digits) variants.add(digits);
  if (/^[0-9]{8}$/.test(digits)) variants.add(`591${digits}`);
  if (/^591[0-9]{8}$/.test(digits)) variants.add(digits.slice(3));
  return variants;
}

function normalizeCommandText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractAppointmentCode(text: string) {
  return text.toUpperCase().match(/\bCITA-[A-Z0-9]{4,}\b/)?.[0] ?? null;
}

async function sendSystemText(admin: ReturnType<typeof createAdminClient>, conversationId: string, to: string, body: string) {
  const meta = await sendMetaMessage(to, { type: "text", text: { preview_url: false, body } });
  await persistOutboundMessage(admin, {
    conversationId,
    metaMessageId: meta?.messages?.[0]?.id ?? null,
    body,
    senderType: "system",
  });
}

async function triggerOutboxDispatch() {
  const secret = Deno.env.get("CRM_DISPATCH_CRON_SECRET")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!secret || !supabaseUrl) return;
  await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/crm-notification-dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crm-dispatch-secret": secret },
    body: JSON.stringify({ source: "doctor-whatsapp-reply" }),
  });
}

async function handleDoctorAppointmentReply(
  admin: ReturnType<typeof createAdminClient>,
  persisted: Awaited<ReturnType<typeof persistInboundMessage>>,
  message: Parameters<typeof persistInboundMessage>[1],
) {
  const text = message.text?.trim();
  if (!text) return false;

  const senderVariants = boliviaWhatsAppVariants(message.from);
  const { data: doctors, error: doctorError } = await admin
    .from("doctor_profiles")
    .select("id,full_name,whatsapp")
    .not("whatsapp", "is", null);
  if (doctorError) throw doctorError;

  const doctor = (doctors ?? []).find((row) => {
    const doctorVariants = boliviaWhatsAppVariants(row.whatsapp);
    return [...doctorVariants].some((value) => senderVariants.has(value));
  });
  if (!doctor) return false;

  const normalized = normalizeCommandText(text);
  const appointmentCode = extractAppointmentCode(text);
  const wantsReschedule = /\b(reprogramar|reagendar|no\s+podre|no\s+podr[eé]|no\s+puedo|no\s+asistire|no\s+atendere|no\s+voy|cambiar\s+(fecha|hora)|conflicto|contingencia)\b/i.test(normalized);
  const acknowledges = /\b(ok|recibido|confirmo|confirmada|listo|gracias|atendere|puedo\s+atender)\b/i.test(normalized);

  if (!appointmentCode && wantsReschedule) {
    await sendSystemText(admin, persisted.conversation.id, message.from, "Claro, para ubicar la cita responde con el codigo. Ejemplo: REPROGRAMAR CITA-D45AE7FE.");
    return true;
  }
  if (!appointmentCode) return false;
  if (!wantsReschedule && !acknowledges) {
    await sendSystemText(admin, persisted.conversation.id, message.from, `Para la cita ${appointmentCode}, responde RECIBIDO ${appointmentCode} si puedes atenderla, o REPROGRAMAR ${appointmentCode} si necesitas cambiarla.`);
    return true;
  }

  const { data: reservation, error: reservationError } = await admin
    .from("appointment_reservations")
    .select("id,appointment_code,appointment_date,start_time,end_time,status,doctor_response_status,doctor_id,title,city")
    .eq("appointment_code", appointmentCode)
    .eq("doctor_id", doctor.id)
    .maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation) {
    await sendSystemText(admin, persisted.conversation.id, message.from, `No encontre una cita ${appointmentCode} asociada a tu agenda. Administracion puede revisarla desde el CRM.`);
    return true;
  }

  const now = new Date().toISOString();
  if (wantsReschedule) {
    if (reservation.status !== "Confirmada") {
      await sendSystemText(admin, persisted.conversation.id, message.from, `La cita ${appointmentCode} ya figura como ${reservation.status}. Administracion revisara el caso si hace falta.`);
      return true;
    }

    const update = await admin.from("appointment_reservations").update({
      status: "Reprogramacion",
      doctor_response_status: "unavailable",
      doctor_response_at: now,
      reschedule_requested_at: now,
      reschedule_reason: "La doctora indico indisponibilidad por WhatsApp.",
    }).eq("id", reservation.id).eq("status", "Confirmada");
    if (update.error) throw update.error;

    const { data: session } = await admin.from("crm_booking_sessions")
      .select("id,conversation_id,contact_id,full_name")
      .eq("appointment_reservation_id", reservation.id)
      .limit(1)
      .maybeSingle();
    const { data: settings } = await admin.from("crm_settings")
      .select("site_url,admin_notification_whatsapps,patient_reschedule_template,admin_doctor_unavailable_template,template_language")
      .eq("id", true)
      .single();
    if (session && settings) {
      const { data: contact } = await admin.from("crm_contacts").select("wa_id,full_name").eq("id", session.contact_id).maybeSingle();
      const reviewUrl = `${String(settings.site_url || "").replace(/\/$/, "")}/panel/pagos-reservas?reservation=${reservation.id}`;
      if (contact?.wa_id) {
        await admin.from("crm_notification_outbox").upsert({
          idempotency_key: `doctor-unavailable-patient:${reservation.id}`,
          booking_session_id: session.id,
          conversation_id: session.conversation_id,
          recipient_kind: "patient",
          recipient_wa_id: contact.wa_id,
          body: `Hola ${contact.full_name || session.full_name || ""}, la doctora informo una contingencia para tu cita ${reservation.appointment_code}. Tu pago sigue resguardado; administracion se comunicara contigo para reprogramarla.`,
          template_name: settings.patient_reschedule_template,
          template_language: settings.template_language,
          template_parameters: [reservation.appointment_code],
        }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      }
      for (const rawRecipient of settings.admin_notification_whatsapps || []) {
        const recipient = digitsOnly(rawRecipient);
        if (!recipient) continue;
        await admin.from("crm_notification_outbox").upsert({
          idempotency_key: `doctor-unavailable-admin:${reservation.id}:${recipient}`,
          booking_session_id: session.id,
          conversation_id: session.conversation_id,
          recipient_kind: "admin",
          recipient_wa_id: recipient,
          body: `La doctora solicito reprogramar la cita ${reservation.appointment_code}. Gestiona la nueva fecha en CRM: ${reviewUrl}`,
          template_name: settings.admin_doctor_unavailable_template,
          template_language: settings.template_language,
          template_parameters: [reservation.appointment_code, reviewUrl],
        }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      }
      await admin.from("crm_booking_sessions").update({ status: "needs_human", state_data: { reschedule_requested: true, reservation_id: reservation.id } }).eq("id", session.id);
      await admin.from("crm_conversations").update({ needs_human: true, intent: "reprogramar_cita" }).eq("id", session.conversation_id);
      EdgeRuntime.waitUntil(triggerOutboxDispatch().catch((error) => console.error("[whatsapp] Outbox dispatch after doctor reply failed", error)));
    }

    await sendSystemText(admin, persisted.conversation.id, message.from, `Listo, registre que necesitas reprogramar la cita ${appointmentCode}. Administracion coordinara la nueva fecha con la paciente.`);
    return true;
  }

  const acknowledge = await admin.from("appointment_reservations").update({
    doctor_response_status: "acknowledged",
    doctor_response_at: now,
  }).eq("id", reservation.id).eq("status", "Confirmada");
  if (acknowledge.error) throw acknowledge.error;
  await sendSystemText(admin, persisted.conversation.id, message.from, `Gracias, quedo registrada la recepcion de la cita ${appointmentCode}.`);
  return true;
}

async function answerWithAi(input: {
  conversationId: string;
  contactName: string | null;
  to: string;
}) {
  const admin = createAdminClient();
  const context = await getAiContext(admin, input.conversationId);
  if (!context.settings.ai_enabled) return;
  let reply: string;
  let usedFallback = false;
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
    if (isUnsafeAiReply(reply)) {
      console.error("[whatsapp] Blocked unsafe Gemini output");
      reply = "Puedo ayudarte con información de tratamientos, precios publicados y reservas. ¿Qué deseas consultar?";
    }
  } catch (error) {
    console.error("[whatsapp] Gemini reply failed; sending fallback", error);
    reply = "Te ayudo. Puedes preguntarme por tratamientos, precios, doctoras o ciudades. Si deseas agendar, escribe “quiero reservar una cita”. Si prefieres una persona, escribe “asesora”.";
    usedFallback = true;
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
  if (usedFallback) {
    const latestInbound = [...context.messages].reverse().find((message) => message.direction === "inbound" && message.body?.trim())?.body ?? null;
    await recordBotLearningEvent(admin, {
      conversationId: input.conversationId,
      eventType: "ai_fallback",
      detectedIntent: "fallback_gemini",
      userText: latestInbound,
      botResponse: reply,
      metadata: { source: "whatsapp-webhook" },
    });
  }
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
    let persisted: Awaited<ReturnType<typeof persistInboundMessage>>;
    try {
      persisted = await persistInboundMessage(admin, message);
    } catch (error) {
      console.error("[whatsapp] persistInboundMessage failed", error);
      continue;
    }
    try {
      if (persisted.duplicate) continue;
      const doctorHandled = await handleDoctorAppointmentReply(admin, persisted, message);
      if (doctorHandled) continue;
      const catalogHandled = await handleTreatmentCatalogConversation(admin, persisted, message);
      if (catalogHandled) continue;
      let bookingHandled = false;
      try {
        bookingHandled = await handleBookingConversation(admin, persisted, message);
      } catch (error) {
        // Booking state must not prevent general information replies.
        console.error("[whatsapp] Booking flow skipped", error);
        const detail = error instanceof Error ? error.message.slice(0, 500) : "unknown booking error";
        await admin.from("crm_booking_sessions")
          .update({ state_data: { booking_error: detail, booking_error_at: new Date().toISOString() } })
          .eq("conversation_id", persisted.conversation.id)
          .in("status", ["collecting_identity", "choosing_date", "choosing_time", "awaiting_payment"]);
      }
      // A button title such as "Para esta persona" is not a request for a
      // human. Interactive replies are handled only by their stable IDs.
      if (bookingHandled || message.interactiveId || !message.text) continue;
      if (isHumanRequest(message.text)) {
        const handoff = /\b(emergencia|urgencia)\b/i.test(message.text)
          ? "Si presentas una urgencia médica, acude de inmediato al servicio de emergencias más cercano. También avisamos a administración para que pueda orientarte."
          : "Entendido. Avisé a administración para que una persona continúe contigo lo antes posible.";
        const alertUpdate = await admin.from("crm_conversations")
          .update({ needs_human: true })
          .eq("id", persisted.conversation.id);
        if (alertUpdate.error) throw alertUpdate.error;
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: handoff } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: handoff, senderType: "system" });
        continue;
      }
      if (!persisted.conversation.ai_enabled) continue;
      const fastReply = await getFastCrmReply(admin, message.text);
      if (fastReply) {
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: fastReply } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: fastReply, senderType: "ai" });
        continue;
      }
      // Attribution enriches a response but must never silence a patient if
      // the optional ad record is absent or temporarily inconsistent.
      let metaAdReply: string | null = null;
      try {
        metaAdReply = await getMetaAdEntryReply(admin, persisted.conversation.id, message.text);
      } catch (error) {
        console.error("[whatsapp] Meta ad context skipped", error);
      }
      if (metaAdReply) {
        const meta = await sendMetaMessage(message.from, { type: "text", text: { preview_url: false, body: metaAdReply } });
        await persistOutboundMessage(admin, { conversationId: persisted.conversation.id, metaMessageId: meta?.messages?.[0]?.id ?? null, body: metaAdReply, senderType: "ai" });
        continue;
      }
      EdgeRuntime.waitUntil(answerWithAi({
        conversationId: persisted.conversation.id,
        contactName: persisted.contact.full_name,
        to: message.from,
      }).catch((error) => console.error("[whatsapp] Deferred Gemini reply failed", error)));
      repliesQueued += 1;
    } catch (error) {
      console.error("[whatsapp] Reply orchestration failed", error);
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
