import { corsHeaders, createAdminClient } from "../_shared/whatsapp-crm.ts";

const page = (title: string, message: string, form = "") => new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:640px;margin:64px auto;padding:24px;color:#3e2a1f"><h1>${title}</h1><p style="line-height:1.6">${message}</p>${form}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  const token = (request.method === "POST" ? (await request.formData()).get("token") : url.searchParams.get("token"))?.toString().trim();
  if (!token || token.length < 32) return page("Enlace inválido", "Este enlace no es válido o ya no está disponible.");
  const admin = createAdminClient();
  const { data: reservation, error } = await admin.from("appointment_reservations")
    .select("id,appointment_code,appointment_date,start_time,status,doctor_response_status")
    .eq("doctor_response_token", token).maybeSingle();
  if (error || !reservation) return page("Cita no encontrada", "El enlace no corresponde a una cita activa.");
  if (request.method === "GET") {
    if (reservation.status !== "Confirmada") return page("Cita ya actualizada", "Esta cita ya no requiere una respuesta desde este enlace.");
    return page("¿No puedes atender esta cita?", `Cita ${reservation.appointment_code} el ${reservation.appointment_date} a las ${String(reservation.start_time).slice(0, 5)}. Al confirmar, no se cancelará el pago: el equipo coordinará la reprogramación.`, `<form method="post"><input type="hidden" name="token" value="${token}"><button style="background:#3e2a1f;color:white;border:0;border-radius:999px;padding:12px 20px;font-weight:700;cursor:pointer">Solicitar reprogramación</button></form>`);
  }
  if (request.method !== "POST") return page("Método no permitido", "");
  if (reservation.status !== "Confirmada") return page("Cita ya actualizada", "No fue necesario realizar otro cambio.");

  const now = new Date().toISOString();
  const update = await admin.from("appointment_reservations").update({ status: "Reprogramacion", doctor_response_status: "unavailable", doctor_response_at: now, reschedule_requested_at: now, reschedule_reason: "La doctora indicó indisponibilidad desde enlace seguro." }).eq("id", reservation.id).eq("status", "Confirmada");
  if (update.error) return page("No se pudo registrar", "Inténtalo nuevamente o comunícate con administración.");
  const { data: session } = await admin.from("crm_booking_sessions").select("id,conversation_id,contact_id,full_name").eq("appointment_reservation_id", reservation.id).limit(1).maybeSingle();
  const { data: settings } = await admin.from("crm_settings").select("site_url,admin_notification_whatsapps,patient_reschedule_template,admin_doctor_unavailable_template,template_language").eq("id", true).single();
  if (session && settings) {
    const { data: contact } = await admin.from("crm_contacts").select("wa_id,full_name").eq("id", session.contact_id).maybeSingle();
    const reviewUrl = `${String(settings.site_url).replace(/\/$/, "")}/panel/pagos-reservas?reservation=${reservation.id}`;
    if (contact?.wa_id) await admin.from("crm_notification_outbox").insert({ idempotency_key: `doctor-unavailable-patient:${reservation.id}`, booking_session_id: session.id, conversation_id: session.conversation_id, recipient_kind: "patient", recipient_wa_id: contact.wa_id, body: `Hola ${contact.full_name || session.full_name || ""}, la doctora informó una contingencia para tu cita ${reservation.appointment_code}. Tu pago sigue resguardado; administración se comunicará contigo para reprogramarla.`, template_name: settings.patient_reschedule_template, template_language: settings.template_language, template_parameters: [reservation.appointment_code] }).select().maybeSingle();
    for (const rawRecipient of settings.admin_notification_whatsapps || []) {
      const recipient = String(rawRecipient).replace(/\D/g, "");
      if (recipient) await admin.from("crm_notification_outbox").insert({ idempotency_key: `doctor-unavailable-admin:${reservation.id}:${recipient}`, booking_session_id: session.id, conversation_id: session.conversation_id, recipient_kind: "admin", recipient_wa_id: recipient, body: `La doctora solicitó reprogramar la cita ${reservation.appointment_code}. Gestiona la nueva fecha en CRM: ${reviewUrl}`, template_name: settings.admin_doctor_unavailable_template, template_language: settings.template_language, template_parameters: [reservation.appointment_code, reviewUrl] });
    }
    await admin.from("crm_booking_sessions").update({ status: "needs_human", state_data: { reschedule_requested: true, reservation_id: reservation.id } }).eq("id", session.id);
    await admin.from("crm_conversations").update({ needs_human: true, intent: "reprogramar_cita" }).eq("id", session.conversation_id);
  }
  return page("Reprogramación solicitada", "Administración fue notificada. No se canceló el pago ni la cita de forma automática; el equipo coordinará una nueva fecha con la paciente.");
});
