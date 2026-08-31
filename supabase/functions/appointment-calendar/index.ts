import { corsHeaders, createAdminClient } from "../_shared/whatsapp-crm.ts";

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utcStamp(date: string, time: string) {
  // Bolivia is UTC-4; keeping the ICS in UTC avoids client-specific TZ parsing differences.
  const instant = new Date(`${date}T${time}-04:00`);
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token || token.length < 32) return new Response("Enlace inválido.", { status: 400, headers: corsHeaders });

  const admin = createAdminClient();
  const { data: reservation, error } = await admin.from("appointment_reservations")
    .select("appointment_code,calendar_uid,appointment_date,start_time,end_time,title,appointment_type,city,location,status")
    .eq("doctor_response_token", token).eq("status", "Confirmada").maybeSingle();
  if (error) return new Response("No fue posible generar el calendario.", { status: 500, headers: corsHeaders });
  if (!reservation) return new Response("La cita no está disponible para el calendario.", { status: 404, headers: corsHeaders });

  const summary = `Cita ${reservation.appointment_code} · ${reservation.title || reservation.appointment_type}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dra Estefany//Agenda//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${reservation.calendar_uid}`, `DTSTAMP:${utcStamp(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 19))}`,
    `DTSTART:${utcStamp(reservation.appointment_date, reservation.start_time)}`,
    `DTEND:${utcStamp(reservation.appointment_date, reservation.end_time)}`,
    `SUMMARY:${escapeIcs(summary)}`, `LOCATION:${escapeIcs(reservation.location || reservation.city || "Consultorio")}`,
    `DESCRIPTION:${escapeIcs(`Cita confirmada. Código ${reservation.appointment_code}.`)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  return new Response(ics, { headers: { ...corsHeaders, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename=\"${reservation.appointment_code}.ics\"` } });
});
