import type { SupabaseClient } from "npm:@supabase/supabase-js@2.105.1";

import {
  persistOutboundMessage,
  requiredEnv,
  sendMetaMessage,
  type IncomingWhatsAppMessage,
} from "./whatsapp-crm.ts";

type BookingSession = {
  id: string;
  conversation_id: string;
  contact_id: string;
  treatment_id: string;
  user_id: string | null;
  patient_id: string | null;
  status: string;
  identity_step: string | null;
  full_name: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  care_mode: "presencial" | "virtual";
  appointment_date: string | null;
  amount_due: number | null;
  hold_expires_at: string | null;
  treatment_order_id: string | null;
  appointment_reservation_id: string | null;
  last_options: Array<Record<string, unknown>>;
  state_data: Record<string, unknown>;
};

type PersistedInbound = {
  contact: { id: string; full_name: string | null; phone: string; wa_id: string };
  conversation: { id: string; ai_enabled: boolean; needs_human: boolean };
  messageId?: string | null;
};

const activeStatuses = ["collecting_identity", "choosing_date", "choosing_time", "awaiting_payment", "payment_review", "needs_human"];
const bookingPattern = /\b(reserv(?:ar|a|o)|agend(?:ar|a|o)|sacar\s+(?:una\s+)?cita|quiero\s+(?:una\s+)?cita|tomar\s+(?:una\s+)?cita)\b/i;
const cancelPattern = /\b(cancelar|salir|detener|ya\s+no)\b/i;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/La_Paz" })
    .format(new Date(`${value}T12:00:00-04:00`));
}

async function sendBookingMessage(
  admin: SupabaseClient,
  conversationId: string,
  to: string,
  body: string,
  payload?: Record<string, unknown>,
) {
  const meta = await sendMetaMessage(to, payload ?? { type: "text", text: { preview_url: /https?:\/\//i.test(body), body } });
  await persistOutboundMessage(admin, {
    conversationId,
    metaMessageId: meta?.messages?.[0]?.id ?? null,
    body,
    senderType: "system",
    messageType: payload?.type === "interactive" ? "interactive" : payload?.type === "image" ? "image" : "text",
  });
}

async function loadActiveSession(admin: SupabaseClient, conversationId: string) {
  const { data, error } = await admin
    .from("crm_booking_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .in("status", activeStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as BookingSession | null;
}

async function getBookableTreatments(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("treatments")
    .select("id,title,slug,city,doctor_id,appointment_type,agenda_tag,treatment_price,direct_booking_price,assessment_price")
    .eq("is_active", true)
    .eq("allows_direct_booking", true)
    .is("deleted_at", null)
    .order("title")
    .limit(40);
  if (error) throw error;
  return (data ?? []).filter((row) =>
    Number(row.treatment_price ?? row.direct_booking_price ?? row.assessment_price ?? 0) > 0
    && !/\b(prueba|test|interna)\b/i.test(String(row.title ?? ""))
  );
}

async function showTreatmentChoices(admin: SupabaseClient, persisted: PersistedInbound) {
  const treatments = await getBookableTreatments(admin);
  if (!treatments.length) {
    await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "En este momento no hay tratamientos habilitados para reserva y pago directo. Te comunicaré con administración para coordinarlo.");
    await admin.from("crm_conversations").update({ needs_human: true, intent: "reservar_cita" }).eq("id", persisted.conversation.id);
    return true;
  }
  const rows = treatments.slice(0, 10).map((treatment, index) => ({
    id: `treatment:${index}`,
    title: String(treatment.title).slice(0, 24),
    description: `${Number(treatment.treatment_price ?? treatment.direct_booking_price ?? treatment.assessment_price).toFixed(2)} Bs`.slice(0, 72),
  }));
  await admin.from("crm_conversations").update({ intent: "select_treatment" }).eq("id", persisted.conversation.id);
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "Elige el tratamiento que deseas reservar:", {
    type: "interactive",
    interactive: { type: "list", body: { text: "Elige el tratamiento que deseas reservar:" }, action: { button: "Ver tratamientos", sections: [{ title: "Tratamientos", rows }] } },
  });
  return true;
}

async function resolveTreatmentSelection(admin: SupabaseClient, conversationId: string, message: IncomingWhatsAppMessage) {
  const treatments = await getBookableTreatments(admin);
  const interactiveIndex = message.interactiveId?.startsWith("treatment:") ? Number(message.interactiveId.split(":")[1]) : Number.NaN;
  if (Number.isInteger(interactiveIndex) && treatments[interactiveIndex]) return treatments[interactiveIndex];
  const text = normalize(message.text ?? "");
  return treatments.find((item) => text.includes(normalize(item.title)) || normalize(item.title).includes(text)) ?? null;
}

async function beginIdentityCollection(admin: SupabaseClient, persisted: PersistedInbound, treatment: Record<string, unknown>) {
  const { data: existing, error: existingError } = await admin
    .from("crm_booking_sessions")
    .select("id")
    .eq("conversation_id", persisted.conversation.id)
    .in("status", activeStatuses);
  if (existingError) throw existingError;
  if (existing?.length) await admin.from("crm_booking_sessions").update({ status: "cancelled" }).in("id", existing.map((row) => row.id));

  const { error } = await admin.from("crm_booking_sessions").insert({
    conversation_id: persisted.conversation.id,
    contact_id: persisted.contact.id,
    treatment_id: treatment.id,
    status: "collecting_identity",
    identity_step: "full_name",
    phone: persisted.contact.phone,
    full_name: persisted.contact.full_name,
    city: treatment.city ?? null,
    care_mode: "presencial",
  });
  if (error) throw error;
  await admin.from("crm_conversations").update({ intent: "reservar_cita" }).eq("id", persisted.conversation.id);
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id,
    `Perfecto, iniciaremos la reserva de ${String(treatment.title)}. Para darte seguimiento y completar la cita, registraremos tus datos en la plataforma. Empecemos con tu nombre completo.`);
}

async function ensurePatientAccount(admin: SupabaseClient, session: BookingSession) {
  const email = session.email!.trim().toLowerCase();
  const documentNumber = session.document_number!.trim();
  const byDocument = await admin.from("profiles").select("id,email,document_number,role").eq("document_number", documentNumber).maybeSingle();
  if (byDocument.error) throw byDocument.error;
  let profile = byDocument.data as { id: string; email: string | null; document_number: string | null; role: string | null } | null;
  if (!profile) {
    const byEmail = await admin.from("profiles").select("id,email,document_number,role").ilike("email", email).maybeSingle();
    if (byEmail.error) throw byEmail.error;
    profile = byEmail.data;
  }
  if (profile && !["patient", "student", "user"].includes(profile.role ?? "patient")) {
    throw new Error("La identidad corresponde a una cuenta interna y requiere revision administrativa.");
  }
  if (profile?.email && profile.email.toLowerCase() !== email) {
    throw new Error("El carnet ya esta vinculado a otro correo. Administracion debe verificar la identidad.");
  }

  let accountCreated = false;
  if (!profile) {
    const passwordBytes = crypto.getRandomValues(new Uint8Array(24));
    const temporaryPassword = `${Array.from(passwordBytes).map((value) => value.toString(16).padStart(2, "0")).join("")}Aa1!`;
    const created = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: session.full_name,
        phone: session.phone,
        city: session.city,
        document_number: documentNumber,
        role: "patient",
      },
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("No se pudo crear la cuenta.");
    profile = { id: created.data.user.id, email, document_number: documentNumber, role: "patient" };
    accountCreated = true;
  }

  let patientResult = await admin.from("patients").select("id").eq("profile_id", profile.id).eq("is_deleted", false).maybeSingle();
  if (patientResult.error) throw patientResult.error;
  if (!patientResult.data) {
    patientResult = await admin.from("patients").insert({
      profile_id: profile.id, full_name: session.full_name, phone: session.phone,
      email, city: session.city, document_number: documentNumber,
    }).select("id").single();
    if (patientResult.error) throw patientResult.error;
  }

  let setupUrl: string | null = null;
  if (accountCreated) {
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://www.draballesteros.com").replace(/\/$/, "");
    const link = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${siteUrl}/restablecer-contrasena` } });
    if (!link.error) setupUrl = link.data.properties?.action_link ?? null;
  }

  await admin.from("crm_booking_sessions").update({
    user_id: profile.id, patient_id: patientResult.data!.id, identity_step: null,
    status: "choosing_date", state_data: { account_created: accountCreated, account_setup_url: setupUrl },
  }).eq("id", session.id);
  await admin.from("crm_contacts").update({
    full_name: session.full_name, email, city: session.city, patient_id: patientResult.data!.id, lead_stage: "cita",
  }).eq("id", session.contact_id);
  return { accountCreated, setupUrl };
}

async function loadSessionTreatment(admin: SupabaseClient, session: BookingSession) {
  const { data, error } = await admin.from("treatments")
    .select("id,title,city,doctor_id,appointment_type,agenda_tag")
    .eq("id", session.treatment_id).single();
  if (error) throw error;
  return data;
}

async function getMappedSlots(admin: SupabaseClient, session: BookingSession) {
  await admin.rpc("crm_expire_booking_holds");
  const treatment = await loadSessionTreatment(admin, session);
  const mapping = await admin.from("treatment_availability_rules")
    .select("availability_rule_id").eq("treatment_id", treatment.id).eq("is_active", true);
  if (mapping.error) throw mapping.error;
  const allowed = new Set((mapping.data ?? []).map((row) => row.availability_rule_id));
  const dateFrom = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  const end = new Date();
  end.setDate(end.getDate() + 45);
  const dateTo = end.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  const result = await admin.rpc("get_available_slots", {
    p_city: treatment.city,
    p_appointment_type: treatment.appointment_type,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_doctor_id: treatment.doctor_id,
    p_agenda_tag: treatment.agenda_tag ?? null,
    p_care_mode: session.care_mode,
  });
  if (result.error) throw result.error;
  return (result.data ?? []).filter((slot: { rule_id: string; available_capacity: number }) => allowed.has(slot.rule_id) && Number(slot.available_capacity) > 0);
}

async function showAvailableDates(admin: SupabaseClient, session: BookingSession, to: string, accountMessage?: string) {
  const slots = await getMappedSlots(admin, session);
  const dates = [...new Set<string>(slots.map((slot: { date: string }) => slot.date))].slice(0, 10);
  if (!dates.length) {
    await admin.from("crm_booking_sessions").update({ status: "needs_human" }).eq("id", session.id);
    await admin.from("crm_conversations").update({ needs_human: true }).eq("id", session.conversation_id);
    await sendBookingMessage(admin, session.conversation_id, to, `${accountMessage ? `${accountMessage}\n\n` : ""}No encontré fechas disponibles durante los próximos 45 días. Administración revisará otras opciones contigo.`);
    return;
  }
  const options = dates.map((date) => ({ date, slot_count: slots.filter((slot: { date: string }) => slot.date === date).length }));
  await admin.from("crm_booking_sessions").update({ status: "choosing_date", last_options: options }).eq("id", session.id);
  const body = `${accountMessage ? `${accountMessage}\n\n` : ""}Estas son las próximas fechas con cupo. Elige una:`;
  await sendBookingMessage(admin, session.conversation_id, to, body, {
    type: "interactive",
    interactive: {
      type: "list", body: { text: body },
      action: { button: "Ver fechas", sections: [{ title: "Fechas disponibles", rows: options.map((option, index) => ({
        id: `date:${index}`, title: formatDate(option.date).slice(0, 24), description: `${option.slot_count} horario${option.slot_count === 1 ? "" : "s"} disponible${option.slot_count === 1 ? "" : "s"}`,
      })) }] },
    },
  });
}

function selectedOption(session: BookingSession, message: IncomingWhatsAppMessage, prefix: string) {
  const index = message.interactiveId?.startsWith(`${prefix}:`) ? Number(message.interactiveId.split(":")[1]) : Number(message.text?.trim()) - 1;
  return Number.isInteger(index) && index >= 0 ? session.last_options[index] ?? null : null;
}

async function showAvailableTimes(admin: SupabaseClient, session: BookingSession, to: string, selectedDate: string) {
  const slots = (await getMappedSlots(admin, session)).filter((slot: { date: string }) => slot.date === selectedDate).slice(0, 10);
  if (!slots.length) {
    await sendBookingMessage(admin, session.conversation_id, to, "Ese día acaba de quedarse sin cupos. Te mostraré nuevamente las fechas disponibles.");
    await showAvailableDates(admin, session, to);
    return;
  }
  await admin.from("crm_booking_sessions").update({ status: "choosing_time", appointment_date: selectedDate, last_options: slots }).eq("id", session.id);
  const body = `Horarios disponibles para ${formatDate(selectedDate)}:`;
  await sendBookingMessage(admin, session.conversation_id, to, body, {
    type: "interactive",
    interactive: {
      type: "list", body: { text: body },
      action: { button: "Ver horarios", sections: [{ title: "Horarios", rows: slots.map((slot: Record<string, unknown>, index: number) => ({
        id: `slot:${index}`, title: `${String(slot.start_time).slice(0, 5)} a ${String(slot.end_time).slice(0, 5)}`,
        description: `${slot.available_capacity} cupo${Number(slot.available_capacity) === 1 ? "" : "s"} · ${String(slot.city).slice(0, 45)}`,
      })) }] },
    },
  });
}

async function sendPaymentInstructions(admin: SupabaseClient, session: BookingSession, to: string) {
  const settings = await admin.from("site_settings").select("payment_qr_image,appointment_qr_payment_image").limit(1).maybeSingle();
  if (settings.error) throw settings.error;
  const qr = settings.data?.payment_qr_image || settings.data?.appointment_qr_payment_image;
  const expires = session.hold_expires_at ? new Intl.DateTimeFormat("es-BO", { timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(session.hold_expires_at)) : "30 minutos";
  const body = `Retuve tu horario hasta ${expires}. Realiza el pago de ${Number(session.amount_due ?? 0).toFixed(2)} Bs y envía aquí una foto o PDF legible del comprobante.`;
  if (qr) await sendBookingMessage(admin, session.conversation_id, to, body, { type: "image", image: { link: qr, caption: body } });
  else {
    await admin.from("crm_booking_sessions").update({ status: "needs_human" }).eq("id", session.id);
    await admin.from("crm_conversations").update({ needs_human: true }).eq("id", session.conversation_id);
    await sendBookingMessage(admin, session.conversation_id, to, "El horario fue retenido, pero el QR no está disponible. Administración continuará contigo.");
  }
}

async function handleIdentityStep(admin: SupabaseClient, session: BookingSession, persisted: PersistedInbound, message: IncomingWhatsAppMessage) {
  const value = message.text?.trim() ?? "";
  if (!value) return true;
  const updates: Record<string, unknown> = {};
  let prompt = "";
  switch (session.identity_step) {
    case "full_name":
      if (value.length < 5 || !value.includes(" ")) prompt = "Necesito tu nombre y apellido completos, por favor.";
      else { updates.full_name = value.slice(0, 140); updates.identity_step = "document_number"; prompt = "Ahora envíame tu número de carnet, sin fotografía."; }
      break;
    case "document_number": {
      const document = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
      if (document.length < 4) prompt = "El número de carnet parece incompleto. Escríbelo nuevamente.";
      else { updates.document_number = document; updates.identity_step = "email"; prompt = "¿Cuál es tu correo electrónico? Lo usaremos para registrar tu reserva y darte acceso a su seguimiento."; }
      break;
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) prompt = "Ese correo no parece válido. Escríbelo nuevamente, por ejemplo nombre@correo.com.";
      else { updates.email = value.toLowerCase(); updates.identity_step = "city"; prompt = "¿En qué ciudad deseas atenderte?"; }
      break;
    case "city":
      if (value.length < 3) prompt = "Indícame la ciudad completa, por favor.";
      else updates.city = value.slice(0, 100);
      break;
    default:
      updates.identity_step = "full_name";
      prompt = "Envíame tu nombre completo para continuar.";
  }
  const updated = await admin.from("crm_booking_sessions").update(updates).eq("id", session.id).select("*").single();
  if (updated.error) throw updated.error;
  const updatedSession = updated.data as BookingSession;
  if (session.identity_step === "city" && updates.city) {
    try {
      const account = await ensurePatientAccount(admin, updatedSession);
      const accountMessage = account.accountCreated
        ? `Te registramos correctamente para darte seguimiento.${account.setupUrl ? ` Configura tu contraseña aquí: ${account.setupUrl}` : " Puedes recuperar tu contraseña desde la plataforma."}`
        : "Tus datos ya estaban registrados; los vinculamos a esta reserva.";
      const ready = await loadActiveSession(admin, session.conversation_id);
      if (!ready) throw new Error("No se pudo recuperar la sesión de reserva.");
      await showAvailableDates(admin, ready, persisted.contact.wa_id, accountMessage);
    } catch (error) {
      await admin.from("crm_booking_sessions").update({ status: "needs_human", state_data: { account_error: error instanceof Error ? error.message : "unknown" } }).eq("id", session.id);
      await admin.from("crm_conversations").update({ needs_human: true }).eq("id", session.conversation_id);
      await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "No pude vincular la cuenta de forma segura. Una administradora verificará tus datos antes de continuar.");
    }
  } else await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, prompt);
  return true;
}

function mediaExtension(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return null;
}

async function downloadMetaMedia(mediaId: string) {
  const token = requiredEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_TOKEN");
  const version = Deno.env.get("WHATSAPP_API_VERSION")?.trim() || "v25.0";
  const metadata = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metadata.ok) throw new Error(`Meta media metadata ${metadata.status}`);
  const { url, mime_type } = await metadata.json() as { url?: string; mime_type?: string };
  if (!url) throw new Error("Meta no devolvio la URL del comprobante.");
  const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) throw new Error(`Meta media download ${file.status}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { bytes, mimeType: mime_type || file.headers.get("content-type") || "application/octet-stream" };
}

async function receivePaymentReceipt(admin: SupabaseClient, session: BookingSession, persisted: PersistedInbound, message: IncomingWhatsAppMessage) {
  if (!message.mediaId) return false;
  const downloaded = await downloadMetaMedia(message.mediaId);
  const extension = mediaExtension(downloaded.mimeType);
  if (!extension || downloaded.bytes.byteLength > 10 * 1024 * 1024) {
    await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "El comprobante debe ser una imagen JPG/PNG o un PDF de máximo 10 MB. Intenta nuevamente.");
    return true;
  }
  const safeMessageId = (message.id || crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, "_");
  const path = `whatsapp/${session.id}/${safeMessageId}.${extension}`;
  const upload = await admin.storage.from("payment-receipts-private").upload(path, downloaded.bytes, { contentType: downloaded.mimeType, upsert: false });
  if (upload.error) throw upload.error;
  const now = new Date().toISOString();
  const reviewExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const submission = await admin.from("crm_payment_submissions").insert({
    booking_session_id: session.id, crm_message_id: persisted.messageId ?? null,
    meta_media_id: message.mediaId, storage_path: path, mime_type: downloaded.mimeType,
    file_size_bytes: downloaded.bytes.byteLength,
  });
  if (submission.error) throw submission.error;
  await Promise.all([
    admin.from("crm_booking_sessions").update({ status: "payment_review", payment_receipt_path: path, payment_submitted_at: now, hold_expires_at: reviewExpiry }).eq("id", session.id),
    admin.from("treatment_orders").update({ status: "En revision", payment_receipt_path: path, payment_submitted_at: now }).eq("id", session.treatment_order_id),
    admin.from("appointment_reservations").update({ payment_receipt_path: path, payment_submitted_at: now, payment_expires_at: reviewExpiry }).eq("id", session.appointment_reservation_id),
    admin.from("crm_contacts").update({ lead_stage: "pago" }).eq("id", session.contact_id),
  ]);
  await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Recibimos tu comprobante correctamente. Administración lo revisará y te avisaremos lo antes posible. Tu horario queda retenido durante la revisión.");
  return true;
}

export async function handleBookingConversation(
  admin: SupabaseClient,
  persisted: PersistedInbound,
  message: IncomingWhatsAppMessage,
) {
  if (persisted.conversation.needs_human) return false;
  const expiry = await admin.rpc("crm_expire_booking_holds");
  if (expiry.error) throw expiry.error;
  let session = await loadActiveSession(admin, persisted.conversation.id);
  if (!session && !bookingPattern.test(message.text ?? "")) {
    const { data: recentlyExpired, error: expiredError } = await admin
      .from("crm_booking_sessions")
      .select("id")
      .eq("conversation_id", persisted.conversation.id)
      .eq("status", "expired")
      .contains("state_data", { expired_reason: "inactivity" })
      .gte("updated_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (expiredError) throw expiredError;
    if (recentlyExpired) {
      await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "El proceso de reserva se cerró por 20 minutos de inactividad. Para empezar nuevamente, escribe “quiero reservar una cita”.");
      return true;
    }
  }
  if (session && ["collecting_identity", "choosing_date", "choosing_time", "awaiting_payment"].includes(session.status)) {
    const activity = await admin.from("crm_booking_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session.id).select("*").single();
    if (activity.error) throw activity.error;
    session = activity.data as BookingSession;
  }
  if (session && cancelPattern.test(message.text ?? "") && session.status !== "payment_review") {
    await admin.from("crm_booking_sessions").update({ status: "cancelled" }).eq("id", session.id);
    if (session.appointment_reservation_id) await admin.from("appointment_reservations").update({ status: "Cancelada" }).eq("id", session.appointment_reservation_id).eq("status", "Pendiente");
    if (session.treatment_order_id) await admin.from("treatment_orders").update({ status: "Cancelado" }).eq("id", session.treatment_order_id).eq("status", "Pendiente");
    await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Cancelé el proceso y liberé el horario. Cuando quieras empezar nuevamente, escribe “quiero reservar”.");
    return true;
  }
  if (session?.status === "awaiting_payment" && message.mediaId) return await receivePaymentReceipt(admin, session, persisted, message);
  if (session?.status === "payment_review") {
    if (message.mediaId) await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Ya recibimos un comprobante y está en revisión. Si necesitas reemplazarlo, una administradora te ayudará.");
    else await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Tu comprobante sigue en revisión. Te enviaremos la confirmación apenas sea aprobado.");
    return true;
  }
  if (session?.status === "needs_human") return false;
  if (session?.status === "collecting_identity") return await handleIdentityStep(admin, session, persisted, message);
  if (session?.status === "choosing_date") {
    const option = selectedOption(session, message, "date") as { date?: string } | null;
    const writtenDate = message.text?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    const date = option?.date || writtenDate;
    if (!date) {
      await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Selecciona una fecha de la lista para continuar.");
      await showAvailableDates(admin, session, persisted.contact.wa_id);
    } else await showAvailableTimes(admin, session, persisted.contact.wa_id, date);
    return true;
  }
  if (session?.status === "choosing_time") {
    const option = selectedOption(session, message, "slot") as { rule_id?: string; date?: string; start_time?: string; end_time?: string } | null;
    if (!option?.rule_id || !option.date || !option.start_time || !option.end_time) {
      await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Selecciona uno de los horarios de la lista.");
      if (session.appointment_date) await showAvailableTimes(admin, session, persisted.contact.wa_id, session.appointment_date);
      return true;
    }
    const hold = await admin.rpc("crm_hold_booking_slot", {
      p_session_id: session.id, p_rule_id: option.rule_id, p_date: option.date,
      p_start_time: option.start_time, p_end_time: option.end_time,
    });
    if (hold.error) {
      await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, `${hold.error.message} Te mostraré los horarios disponibles nuevamente.`);
      await showAvailableTimes(admin, session, persisted.contact.wa_id, option.date);
      return true;
    }
    session = hold.data as BookingSession;
    await sendPaymentInstructions(admin, session, persisted.contact.wa_id);
    return true;
  }

  const conversationIntent = await admin.from("crm_conversations").select("intent").eq("id", persisted.conversation.id).single();
  if (conversationIntent.data?.intent === "select_treatment" || message.interactiveId?.startsWith("treatment:")) {
    const treatment = await resolveTreatmentSelection(admin, persisted.conversation.id, message);
    if (treatment) {
      await beginIdentityCollection(admin, persisted, treatment);
      return true;
    }
  }
  if (!bookingPattern.test(message.text ?? "")) return false;
  const treatment = await resolveTreatmentSelection(admin, persisted.conversation.id, message);
  if (treatment) await beginIdentityCollection(admin, persisted, treatment);
  else await showTreatmentChoices(admin, persisted);
  return true;
}
