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
  contact: { id: string; full_name: string | null; phone: string; wa_id: string; city?: string | null };
  conversation: { id: string; ai_enabled: boolean; needs_human: boolean };
  messageId?: string | null;
};

const activeStatuses = ["collecting_identity", "choosing_date", "choosing_time", "awaiting_payment", "payment_review", "needs_human"];
const bookingPattern = /\b(reserv(?:ar|a|o)|agend(?:ar|a|o)|sacar\s+(?:una\s+)?cita|quiero\s+(?:una\s+)?cita|tomar\s+(?:una\s+)?cita)\b/i;
const cancelPattern = /\b(cancelar|salir|detener|ya\s+no)\b/i;
const boliviaCities = ["Cochabamba", "La Paz", "Santa Cruz", "Sucre", "Oruro", "Potosi", "Tarija", "Beni", "Pando"];
const treatmentCatalogPattern = /\b(que|cuales|cu[aá]les|ver|mu[eé]strame|informaci[oó]n|saber).{0,45}\b(trat[a]?m?ientos?|servicios?)\b|\b(trat[a]?m?ientos?|servicios?).{0,45}\b(disponibles?|tienen|ofrecen|hay)\b/i;

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
    .limit(1);
  if (error) throw error;
  return (data?.[0] ?? null) as BookingSession | null;
}

async function getBookableTreatments(admin: SupabaseClient, city?: string | null) {
  let query = admin
    .from("treatments")
    .select("id,title,slug,city,doctor_id,appointment_type,agenda_tag,treatment_price,direct_booking_price,assessment_price")
    .eq("is_active", true)
    .eq("allows_direct_booking", true)
    .is("deleted_at", null)
    .order("title")
    .limit(40);
  if (city) query = query.eq("city", city);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter((row) =>
    Number(row.treatment_price ?? row.direct_booking_price ?? row.assessment_price ?? 0) > 0
    && !/\b(prueba|test|interna)\b/i.test(String(row.title ?? ""))
  );
}

async function getInformationalTreatments(admin: SupabaseClient, city?: string | null) {
  let query = admin
    .from("treatments")
    .select("id,title,short_description,description,public_info,requires_assessment,allows_direct_booking,treatment_price,direct_booking_price,assessment_price,assessment_price_presencial")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("title")
    .limit(40);
  if (city) query = query.eq("city", city);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter((row) => !/\b(prueba|test|interna)\b/i.test(String(row.title ?? "")));
}

function displayPrice(treatment: Record<string, unknown>) {
  const price = Number(treatment.requires_assessment
    ? treatment.assessment_price_presencial ?? treatment.assessment_price
    : treatment.treatment_price ?? treatment.direct_booking_price ?? treatment.assessment_price ?? 0);
  return price > 0 ? `${price.toFixed(2)} Bs` : null;
}

async function rememberCityInterest(admin: SupabaseClient, contactId: string, city: string) {
  const now = new Date().toISOString();
  const interest = await admin.from("crm_contact_city_interests").upsert({
    contact_id: contactId, city, source: "whatsapp_catalog", last_selected_at: now,
  }, { onConflict: "contact_id,city" });
  if (interest.error) throw interest.error;
  const contact = await admin.from("crm_contacts").update({ city }).eq("id", contactId);
  if (contact.error) throw contact.error;
}

async function showCityChoices(admin: SupabaseClient, persisted: PersistedInbound, purpose: "info" | "booking") {
  const body = purpose === "booking"
    ? "Antes de mostrar horarios, elige la ciudad donde deseas atenderte:"
    : "Elige tu ciudad para mostrarte solamente los tratamientos disponibles allí:";
  await admin.from("crm_conversations").update({ intent: purpose === "booking" ? "select_treatment_city" : "catalog_city" }).eq("id", persisted.conversation.id);
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, body, {
    type: "interactive",
    interactive: {
      type: "list", body: { text: body },
      action: { button: "Elegir ciudad", sections: [{ title: "Ciudades", rows: boliviaCities.map((city, index) => ({
        id: `catalog-city:${purpose}:${index}`, title: city, description: "Ver tratamientos disponibles",
      })) }] },
    },
  });
  return true;
}

async function showTreatmentInformationChoices(admin: SupabaseClient, persisted: PersistedInbound, city: string) {
  const treatments = await getInformationalTreatments(admin, city);
  if (!treatments.length) return false;
  const rows = treatments.slice(0, 10).map((treatment) => ({
    id: `treatment-info:${treatment.id}`,
    title: String(treatment.title).slice(0, 24),
    description: treatment.requires_assessment
      ? `Evaluación previa${displayPrice(treatment) ? ` · ${displayPrice(treatment)}` : ""}`.slice(0, 72)
      : `${displayPrice(treatment) ?? "Consultar precio"}`.slice(0, 72),
  }));
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "Elige un tratamiento para ver su información, precio y cómo agendar:", {
    type: "interactive",
    interactive: { type: "list", body: { text: "Elige un tratamiento para ver su información, precio y cómo agendar:" }, action: { button: "Ver tratamientos", sections: [{ title: "Tratamientos", rows }] } },
  });
  return true;
}

export async function handleTreatmentCatalogConversation(admin: SupabaseClient, persisted: PersistedInbound, message: IncomingWhatsAppMessage) {
  if (message.interactiveId === "booking-help") {
    await admin.from("crm_conversations")
      .update({ needs_human: true, intent: "solicitar_ayuda_reserva" })
      .eq("id", persisted.conversation.id);
    await sendBookingMessage(
      admin,
      persisted.conversation.id,
      persisted.contact.wa_id,
      "De acuerdo. Una administradora revisará tu solicitud y te ayudará a encontrar una opción disponible.",
    );
    return true;
  }
  const changeCity = message.interactiveId?.match(/^catalog-change-city:(info|booking)$/);
  if (changeCity) return await showCityChoices(admin, persisted, changeCity[1] as "info" | "booking");
  const cityChoice = message.interactiveId?.match(/^catalog-city:(info|booking):(\d+)$/);
  if (cityChoice) {
    const city = boliviaCities[Number(cityChoice[2])];
    if (!city) return true;
    await rememberCityInterest(admin, persisted.contact.id, city);
    if (cityChoice[1] === "booking") return await showTreatmentChoices(admin, persisted, city);
    const shown = await showTreatmentInformationChoices(admin, persisted, city);
    if (!shown) await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, `Aún no tenemos tratamientos publicados en ${city}. Puedes elegir otra ciudad:`, {
      type: "interactive",
      interactive: { type: "button", body: { text: `Aún no tenemos tratamientos publicados en ${city}. Puedes elegir otra ciudad:` }, action: { buttons: [
        { type: "reply", reply: { id: "catalog-change-city:info", title: "Elegir otra ciudad" } },
      ] } },
    });
    return true;
  }
  if (message.interactiveId === "treatment-catalog") return await showCityChoices(admin, persisted, "info");
  if (treatmentCatalogPattern.test(message.text ?? "")) return await showCityChoices(admin, persisted, "info");
  const infoId = message.interactiveId?.startsWith("treatment-info:") ? message.interactiveId.slice("treatment-info:".length) : null;
  const bookId = message.interactiveId?.startsWith("treatment-book:") ? message.interactiveId.slice("treatment-book:".length) : null;
  if (bookId) {
    const treatments = await getInformationalTreatments(admin);
    const treatment = treatments.find((item) => item.id === bookId);
    if (!treatment) return false;
    if (!treatment.allows_direct_booking) {
      await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "Este tratamiento requiere una evaluación previa. Una administradora te orientará para coordinarla.");
      await admin.from("crm_conversations").update({ needs_human: true, intent: "solicitar_evaluacion" }).eq("id", persisted.conversation.id);
      return true;
    }
    await beginIdentityCollection(admin, persisted, treatment);
    return true;
  }
  if (!infoId) return false;
  const treatments = await getInformationalTreatments(admin);
  const treatment = treatments.find((item) => item.id === infoId);
  if (!treatment) return false;
  const info = String(treatment.public_info || treatment.short_description || treatment.description || "La información detallada se brinda luego de una valoración profesional.").trim().slice(0, 2800);
  const price = displayPrice(treatment);
  const priceLine = treatment.requires_assessment
    ? `Requiere evaluación previa${price ? `. Valor de la evaluación: ${price}` : "."}`
    : price ? `Precio: ${price}.` : "Precio: consulta con administración.";
  const body = `*${treatment.title}*\n\n${info}\n\n${priceLine}`;
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, body, {
    type: "interactive",
    interactive: { type: "button", body: { text: body.slice(0, 1024) }, action: { buttons: [
      { type: "reply", reply: { id: `treatment-book:${treatment.id}`, title: treatment.requires_assessment ? "Pedir evaluación" : "Reservar cita" } },
      { type: "reply", reply: { id: "treatment-catalog", title: "Ver otros" } },
    ] } },
  });
  return true;
}

async function showTreatmentChoices(admin: SupabaseClient, persisted: PersistedInbound, city?: string | null) {
  if (!city) return await showCityChoices(admin, persisted, "booking");
  const treatments = await getBookableTreatments(admin, city);
  if (!treatments.length) {
    const body = `Aún no hay tratamientos habilitados para reserva directa en ${city}. Puedes elegir otra ciudad o pedir ayuda a administración.`;
    await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, body, {
      type: "interactive",
      interactive: { type: "button", body: { text: body }, action: { buttons: [
        { type: "reply", reply: { id: "catalog-change-city:booking", title: "Elegir otra ciudad" } },
        { type: "reply", reply: { id: "booking-help", title: "Hablar con administración" } },
      ] } },
    });
    return true;
  }
  const rows = treatments.slice(0, 10).map((treatment, index) => ({
    id: `treatment:${index}`,
    title: String(treatment.title).slice(0, 24),
    description: `${Number(treatment.treatment_price ?? treatment.direct_booking_price ?? treatment.assessment_price).toFixed(2)} Bs`.slice(0, 72),
  }));
  await admin.from("crm_conversations").update({ intent: "select_treatment" }).eq("id", persisted.conversation.id);
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, `Elige el tratamiento que deseas reservar en ${city}:`, {
    type: "interactive",
    interactive: { type: "list", body: { text: `Elige el tratamiento que deseas reservar en ${city}:` }, action: { button: "Ver tratamientos", sections: [{ title: "Tratamientos", rows }] } },
  });
  return true;
}

async function resolveTreatmentSelection(admin: SupabaseClient, conversationId: string, message: IncomingWhatsAppMessage, city?: string | null) {
  const treatments = await getBookableTreatments(admin, city);
  const interactiveIndex = message.interactiveId?.startsWith("treatment:") ? Number(message.interactiveId.split(":")[1]) : Number.NaN;
  if (Number.isInteger(interactiveIndex) && treatments[interactiveIndex]) return treatments[interactiveIndex];
  const text = normalize(message.text ?? "");
  return treatments.find((item) => text.includes(normalize(item.title)) || normalize(item.title).includes(text)) ?? null;
}

type RegisteredPatient = {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  document_number: string | null;
  email: string | null;
  city: string | null;
};

async function loadRegisteredContactPatient(admin: SupabaseClient, contactId: string) {
  const contact = await admin.from("crm_contacts").select("patient_id").eq("id", contactId).limit(1);
  if (contact.error) throw contact.error;
  const patientId = contact.data?.[0]?.patient_id as string | null | undefined;
  if (!patientId) return null;
  const patient = await admin.from("patients")
    .select("id,profile_id,full_name,document_number,email,city")
    .eq("id", patientId)
    .eq("is_deleted", false)
    .limit(1);
  if (patient.error) throw patient.error;
  return (patient.data?.[0] ?? null) as RegisteredPatient | null;
}

function firstMissingIdentityStep(patient: RegisteredPatient, fallbackCity: string | null) {
  if (!patient.full_name?.trim()) return "full_name";
  if (!patient.document_number?.trim()) return "document_number";
  if (!patient.email?.trim()) return "email";
  if (!(patient.city ?? fallbackCity)?.trim()) return "city";
  return null;
}

function identityPrompt(step: string) {
  if (step === "document_number") return "Para completar la reserva, envíame el número de carnet del paciente, sin fotografía.";
  if (step === "email") return "¿Cuál es el correo electrónico del paciente? Lo usaremos para registrar su reserva y darle acceso al seguimiento.";
  if (step === "city") return "¿En qué ciudad desea atenderse el paciente?";
  return "Para completar la reserva, envíame el nombre y apellido completos del paciente.";
}

async function beginIdentityCollection(admin: SupabaseClient, persisted: PersistedInbound, treatment: Record<string, unknown>) {
  const { data: existing, error: existingError } = await admin
    .from("crm_booking_sessions")
    .select("id")
    .eq("conversation_id", persisted.conversation.id)
    .in("status", activeStatuses);
  if (existingError) throw existingError;
  if (existing?.length) await admin.from("crm_booking_sessions").update({ status: "cancelled" }).in("id", existing.map((row) => row.id));

  const registeredPatient = await loadRegisteredContactPatient(admin, persisted.contact.id);

  const { error } = await admin.from("crm_booking_sessions").insert({
    conversation_id: persisted.conversation.id,
    contact_id: persisted.contact.id,
    treatment_id: treatment.id,
    status: "collecting_identity",
    identity_step: registeredPatient ? "patient_choice" : "full_name",
    phone: persisted.contact.phone,
    user_id: registeredPatient?.profile_id ?? null,
    patient_id: registeredPatient?.id ?? null,
    full_name: registeredPatient?.full_name ?? persisted.contact.full_name,
    document_number: registeredPatient?.document_number ?? null,
    email: registeredPatient?.email ?? null,
    city: treatment.city ?? registeredPatient?.city ?? null,
    care_mode: "presencial",
    state_data: { booking_for_other: false },
  });
  if (error) throw error;
  // Elegir "Reservar cita" es una acción explícita para retomar la
  // automatización, incluso si antes se pidió atención humana.
  await admin.from("crm_conversations").update({ intent: "reservar_cita", needs_human: false }).eq("id", persisted.conversation.id);
  if (registeredPatient) {
    const name = registeredPatient.full_name?.trim() || "el paciente registrado";
    const body = `Encontré los datos registrados de ${name}. ¿La cita de ${String(treatment.title)} será para este usuario o para otro paciente?`;
    await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, body, {
      type: "interactive",
      interactive: {
        type: "button", body: { text: body }, action: { buttons: [
          { type: "reply", reply: { id: "booking-patient:same", title: "Para este usuario" } },
          { type: "reply", reply: { id: "booking-patient:other", title: "Para otro paciente" } },
        ] },
      },
    });
    return;
  }
  await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id,
    `Perfecto, iniciaremos la reserva de ${String(treatment.title)}. Para completar la cita, empecemos con el nombre y apellido completos del paciente.`);
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
  await sendBookingMessage(admin, session.conversation_id, to, "¿Quieres cambiar de fecha?", {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Quieres cambiar de fecha?" },
      action: { buttons: [{ type: "reply", reply: { id: "booking-back:dates", title: "Elegir otra fecha" } }] },
    },
  });
}

function resolvePublicQrUrl(value: unknown) {
  const qr = typeof value === "string" ? value.trim() : "";
  if (!qr) return null;
  if (/^https?:\/\//i.test(qr)) return qr;

  const publicBaseUrl = Deno.env.get("R2_PUBLIC_BASE_URL")?.trim() || Deno.env.get("VITE_R2_PUBLIC_BASE_URL")?.trim();
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl.replace(/\/+$/g, "")}/${qr.replace(/^\/+/, "")}`;
}

async function sendPaymentInstructions(admin: SupabaseClient, session: BookingSession, to: string) {
  const settings = await admin.from("site_settings").select("payment_qr_image,appointment_qr_payment_image").limit(1);
  if (settings.error) throw settings.error;
  const paymentSettings = settings.data?.[0] ?? null;
  const qr = resolvePublicQrUrl(paymentSettings?.payment_qr_image || paymentSettings?.appointment_qr_payment_image);
  const expires = session.hold_expires_at ? new Intl.DateTimeFormat("es-BO", { timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(session.hold_expires_at)) : "30 minutos";
  const body = `Retuve tu horario hasta ${expires}. Realiza el pago de ${Number(session.amount_due ?? 0).toFixed(2)} Bs y envía aquí una foto o PDF legible del comprobante.`;
  if (qr) {
    try {
      await sendBookingMessage(admin, session.conversation_id, to, body, { type: "image", image: { link: qr, caption: body } });
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 500) : "No se pudo enviar el QR";
      console.error("[whatsapp] Payment QR delivery failed", detail);
      await admin.from("crm_booking_sessions")
        .update({ state_data: { ...session.state_data, payment_qr_error: detail, payment_qr_error_at: new Date().toISOString() } })
        .eq("id", session.id);
    }
  }

  await admin.from("crm_booking_sessions").update({ status: "needs_human" }).eq("id", session.id);
  await admin.from("crm_conversations").update({ needs_human: true }).eq("id", session.conversation_id);
  await sendBookingMessage(admin, session.conversation_id, to, "El horario fue retenido, pero no pude enviarte el QR de pago. Administración continuará contigo para enviártelo.");
}

async function handleIdentityStep(admin: SupabaseClient, session: BookingSession, persisted: PersistedInbound, message: IncomingWhatsAppMessage) {
  const value = message.text?.trim() ?? "";
  if (session.identity_step === "patient_choice") {
    const choice = message.interactiveId === "booking-patient:same"
      ? "same"
      : message.interactiveId === "booking-patient:other"
        ? "other"
        : normalize(value);
    if (choice === "same" || choice === "para este usuario" || choice === "para esta persona") {
      const patient = await loadRegisteredContactPatient(admin, session.contact_id);
      if (!patient) {
        await admin.from("crm_booking_sessions").update({
          patient_id: null, user_id: null, full_name: null, document_number: null, email: null,
          identity_step: "full_name", state_data: { booking_for_other: false },
        }).eq("id", session.id);
        await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "No pude recuperar la ficha anterior. Envíame el nombre y apellido completos del paciente para continuar.");
        return true;
      }
      const missingStep = firstMissingIdentityStep(patient, session.city);
      const sessionUpdate: Record<string, unknown> = {
        user_id: patient.profile_id,
        patient_id: patient.id,
        full_name: patient.full_name,
        document_number: patient.document_number,
        email: patient.email,
        city: patient.city ?? session.city,
        identity_step: missingStep,
        state_data: { booking_for_other: false },
      };
      if (!missingStep) sessionUpdate.status = "choosing_date";
      const updated = await admin.from("crm_booking_sessions").update(sessionUpdate).eq("id", session.id).select("*").limit(1);
      if (updated.error || !updated.data?.[0]) throw updated.error ?? new Error("No se pudo actualizar la reserva.");
      await admin.from("crm_contacts").update({ patient_id: patient.id, lead_stage: "cita" }).eq("id", session.contact_id);
      if (missingStep) {
        await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, identityPrompt(missingStep));
      } else {
        await showAvailableDates(admin, updated.data[0] as BookingSession, persisted.contact.wa_id, `Reservaremos a nombre de ${patient.full_name}.`);
      }
      return true;
    }
    if (choice === "other" || choice === "para otro paciente" || choice === "para otra persona") {
      const updated = await admin.from("crm_booking_sessions").update({
        user_id: null, patient_id: null, full_name: null, document_number: null, email: null,
        identity_step: "full_name", state_data: { booking_for_other: true },
      }).eq("id", session.id);
      if (updated.error) throw updated.error;
      await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id,
        "De acuerdo. La cita quedará a nombre del paciente que indiques. Envíame su nombre y apellido completos.");
      return true;
    }
    const name = session.full_name?.trim() || "el paciente registrado";
    const body = `¿La cita será para ${name} o para otro paciente?`;
    await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, body, {
      type: "interactive",
      interactive: { type: "button", body: { text: body }, action: { buttons: [
        { type: "reply", reply: { id: "booking-patient:same", title: "Para este usuario" } },
        { type: "reply", reply: { id: "booking-patient:other", title: "Para otro paciente" } },
      ] } },
    });
    return true;
  }
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
  const updated = await admin.from("crm_booking_sessions").update(updates).eq("id", session.id).select("*").limit(1);
  if (updated.error || !updated.data?.[0]) throw updated.error ?? new Error("No se pudo actualizar la reserva.");
  const updatedSession = updated.data[0] as BookingSession;
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
  // Expirar retenciones es mantenimiento. Una falla temporal en esa limpieza
  // nunca debe impedir que el paciente continúe una reserva válida.
  const expiry = await admin.rpc("crm_expire_booking_holds");
  if (expiry.error) console.error("[whatsapp] Could not expire old booking holds", expiry.error);
  let session = await loadActiveSession(admin, persisted.conversation.id);
  // Una conversación tomada por una administradora no debe bloquear una
  // reserva activa: el paciente aún debe poder pagar o subir su comprobante.
  if (persisted.conversation.needs_human && !session) return false;
  if (!session && !bookingPattern.test(message.text ?? "")) {
    const { data: recentlyExpiredRows, error: expiredError } = await admin
      .from("crm_booking_sessions")
      .select("id")
      .eq("conversation_id", persisted.conversation.id)
      .eq("status", "expired")
      .contains("state_data", { expired_reason: "inactivity" })
      .gte("updated_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(1);
    if (expiredError) throw expiredError;
    const recentlyExpired = recentlyExpiredRows?.[0] ?? null;
    if (recentlyExpired) {
      await sendBookingMessage(admin, persisted.conversation.id, persisted.contact.wa_id, "El proceso de reserva se cerró por 20 minutos de inactividad. Para empezar nuevamente, escribe “quiero reservar una cita”.");
      return true;
    }
  }
  if (session && ["collecting_identity", "choosing_date", "choosing_time", "awaiting_payment"].includes(session.status)) {
    const activity = await admin.from("crm_booking_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session.id).select("*").limit(1);
    if (activity.error || !activity.data?.[0]) throw activity.error ?? new Error("No se pudo actualizar la actividad de la reserva.");
    session = activity.data[0] as BookingSession;
  }
  if (session && cancelPattern.test(message.text ?? "") && session.status !== "payment_review") {
    await admin.from("crm_booking_sessions").update({ status: "cancelled" }).eq("id", session.id);
    if (session.appointment_reservation_id) await admin.from("appointment_reservations").update({ status: "Cancelada" }).eq("id", session.appointment_reservation_id).eq("status", "Pendiente");
    if (session.treatment_order_id) await admin.from("treatment_orders").update({ status: "Cancelado" }).eq("id", session.treatment_order_id).eq("status", "Pendiente");
    await sendBookingMessage(admin, session.conversation_id, persisted.contact.wa_id, "Cancelé el proceso y liberé el horario. Cuando quieras empezar nuevamente, escribe “quiero reservar”.");
    return true;
  }
  if (session?.status === "awaiting_payment" && message.mediaId) return await receivePaymentReceipt(admin, session, persisted, message);
  if (session?.status === "awaiting_payment") {
    await sendPaymentInstructions(admin, session, persisted.contact.wa_id);
    return true;
  }
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
    const wantsOtherDate = message.interactiveId === "booking-back:dates"
      || /^(volver|volver a fechas|elegir otra fecha)$/i.test(normalize(message.text ?? ""));
    if (wantsOtherDate) {
      const reset = await admin.from("crm_booking_sessions")
        .update({ status: "choosing_date", appointment_date: null, last_options: [] })
        .eq("id", session.id);
      if (reset.error) throw reset.error;
      await showAvailableDates(admin, session, persisted.contact.wa_id, "De acuerdo, elige otra fecha con cupo:");
      return true;
    }
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

  const conversationIntent = await admin.from("crm_conversations").select("intent").eq("id", persisted.conversation.id).maybeSingle();
  if (conversationIntent.error) throw conversationIntent.error;
  if (conversationIntent.data?.intent === "select_treatment" || message.interactiveId?.startsWith("treatment:")) {
    const treatment = await resolveTreatmentSelection(admin, persisted.conversation.id, message, persisted.contact.city);
    if (treatment) {
      await beginIdentityCollection(admin, persisted, treatment);
      return true;
    }
  }
  if (!bookingPattern.test(message.text ?? "")) return false;
  const treatment = await resolveTreatmentSelection(admin, persisted.conversation.id, message, persisted.contact.city);
  if (treatment) await beginIdentityCollection(admin, persisted, treatment);
  else await showTreatmentChoices(admin, persisted, persisted.contact.city);
  return true;
}
