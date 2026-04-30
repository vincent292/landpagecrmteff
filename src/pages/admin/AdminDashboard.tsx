import { useEffect, useMemo, useState } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { CalendarDays, ClipboardList, Download, ExternalLink, GraduationCap, Mail, MessageCircleMore, MessagesSquare, Sparkles, Users } from "lucide-react";

import { LoadingState } from "../../components/common/AsyncState";
import { getAdminCalendarEvents } from "../../services/calendarService";
import { getAdminCourses } from "../../services/courseService";
import { getCourseEnrollments } from "../../services/enrollmentService";
import { getInformationRequests, type InformationRequestRow } from "../../services/requestService";
import { getReservationsAdmin, type AppointmentReservationRow } from "../../services/reservationService";
import { getAdminTreatments } from "../../services/treatmentService";
import { formatDate } from "../../utils/text";

export function AdminDashboard() {
  const [requests, setRequests] = useState<InformationRequestRow[]>([]);
  const [coursesCount, setCoursesCount] = useState(0);
  const [enrollmentsPending, setEnrollmentsPending] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
  const [treatmentsCount, setTreatmentsCount] = useState(0);
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<AppointmentReservationRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getInformationRequests(),
      getAdminCourses(),
      getCourseEnrollments(),
      getAdminCalendarEvents(),
      getAdminTreatments(),
      getReservationsAdmin(),
    ])
      .then(([requestRows, courseRows, enrollmentRows, eventRows, treatmentRows, reservationRows]) => {
        setRequests(requestRows);
        setCoursesCount(courseRows.filter((item) => item.is_active).length);
        setEnrollmentsPending(enrollmentRows.filter((item) => item.status === "Pendiente").length);
        setEventsCount(eventRows.filter((item) => item.is_active).length);
        setTreatmentsCount(treatmentRows.filter((item) => item.is_active).length);
        setReservations(reservationRows);
      })
      .finally(() => setLoading(false));
  }, []);

  const newRequests = useMemo(
    () => requests.filter((item) => item.status === "Nuevo").length,
    [requests]
  );
  const activeReservations = useMemo(
    () => reservations.filter((item) => item.status !== "Cancelada" && item.status !== "Rechazada"),
    [reservations]
  );

  if (loading) return <LoadingState label="Cargando dashboard..." />;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[34px] border border-[rgba(198,162,123,0.18)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Panel administrativo
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
              Una vista clara para mover el día a día de la clínica con elegancia.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
              Aqui concentramos solicitudes, inscripciones, actividades y tratamientos
              activos para que el seguimiento sea rapido, ordenado y amable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label="Solicitudes nuevas" value={String(newRequests)} />
            <MiniStat label="Pendientes por revisar" value={String(enrollmentsPending)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Metric icon={<MessagesSquare className="h-5 w-5" />} label="Solicitudes nuevas" value={String(newRequests)} />
        <Metric icon={<ClipboardList className="h-5 w-5" />} label="Total solicitudes" value={String(requests.length)} />
        <Metric icon={<GraduationCap className="h-5 w-5" />} label="Cursos activos" value={String(coursesCount)} />
        <Metric icon={<Users className="h-5 w-5" />} label="Inscripciones pendientes" value={String(enrollmentsPending)} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Citas agendadas" value={String(activeReservations.length)} />
        <Metric icon={<Sparkles className="h-5 w-5" />} label="Tratamientos activos" value={String(treatmentsCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-ink)]">Calendario clinico</h2>
              <p className="mt-1 text-sm text-[var(--color-copy)]">Todas las citas activas de pacientes en una sola vista.</p>
            </div>
          </div>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="auto"
            events={activeReservations.map((item) => ({
              id: item.id,
              title: `${item.start_time.slice(0, 5)} ${item.patients?.full_name ?? "Paciente"}`,
              start: `${item.appointment_date}T${item.start_time}`,
              end: `${item.appointment_date}T${item.end_time}`,
              color: getReservationColor(item.status),
            }))}
            eventClick={(info) => setSelectedReservation(activeReservations.find((item) => item.id === info.event.id) ?? null)}
          />
        </div>

        <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Proximas citas</h2>
          <div className="mt-5 grid gap-3">
            {activeReservations.slice(0, 6).map((reservation) => (
              <button
                key={reservation.id}
                onClick={() => setSelectedReservation(reservation)}
                className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.76)] p-4 text-left transition hover:bg-white"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  {reservation.status} · {reservation.city}
                </p>
                <h3 className="mt-2 font-semibold">{reservation.patients?.full_name ?? "Paciente"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                  {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
                </p>
              </button>
            ))}
            {activeReservations.length === 0 && <p className="text-sm text-[var(--color-copy)]">Todavia no hay citas activas.</p>}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Solicitudes recientes</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[var(--color-copy)]">
                <tr>
                  <th className="py-3">Nombre</th>
                  <th>Celular</th>
                  <th>Ciudad</th>
                  <th>Interés</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {requests.slice(0, 8).map((request) => (
                  <tr key={request.id} className="border-t border-[rgba(198,162,123,0.14)]">
                    <td className="py-4 font-medium">{request.full_name}</td>
                    <td>{request.phone}</td>
                    <td>{request.city ?? "Sin ciudad"}</td>
                    <td>{request.interest_title ?? "General"}</td>
                    <td>
                      <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                        {request.status}
                      </span>
                    </td>
                    <td>{new Date(request.created_at).toLocaleDateString("es-BO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Prioridades del dia</h2>
            <div className="mt-5 grid gap-3">
              <PriorityItem
                title="Responder nuevas solicitudes"
                detail={`${newRequests} conversaciones necesitan primer contacto.`}
              />
              <PriorityItem
                title="Revisar inscripciones pendientes"
                detail={`${enrollmentsPending} registros esperan confirmacion.`}
              />
              <PriorityItem
                title="Validar agenda activa"
                detail={`${eventsCount} actividades visibles para pacientes y asistentes.`}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">Resumen operativo</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuickCard label="Solicitudes abiertas" value={String(requests.filter((item) => item.status !== "Finalizado" && item.status !== "Descartado").length)} />
              <QuickCard label="Cursos publicados" value={String(coursesCount)} />
              <QuickCard label="Agenda visible" value={String(eventsCount)} />
              <QuickCard label="Catalogo activo" value={String(treatmentsCount)} />
            </div>
          </div>
        </div>
      </section>

      {selectedReservation && (
        <AppointmentModal reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="flex items-center gap-3 text-[var(--color-accent-strong)]">
        {icon}
        <p className="text-sm text-[var(--color-copy)]">{label}</p>
      </div>
      <p className="mt-4 text-4xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function PriorityItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4">
      <h3 className="font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
    </div>
  );
}

function QuickCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-[rgba(247,242,236,0.78)] p-4">
      <p className="text-sm text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function AppointmentModal({ reservation, onClose }: { reservation: AppointmentReservationRow; onClose: () => void }) {
  const patientName = reservation.patients?.full_name ?? "Paciente";
  const phone = reservation.patients?.phone?.replace(/\D/g, "") ?? "";
  const appointmentText = `Cita ${reservation.appointment_type} - ${patientName}`;
  const message = `Hola ${patientName}, te confirmamos tu cita de ${reservation.appointment_type} para el ${formatDate(reservation.appointment_date)} de ${reservation.start_time.slice(0, 5)} a ${reservation.end_time.slice(0, 5)}.`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[30px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              {reservation.status} · {reservation.city}
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{patientName}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
          {reservation.appointment_type}
          <br />
          {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
          <br />
          {reservation.location ?? "Sin ubicacion"} · {reservation.patients?.phone ?? "Sin celular"}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a href={getGoogleCalendarUrl(reservation)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <ExternalLink className="h-4 w-4" />
            Google Calendar
          </a>
          <button onClick={() => downloadIcs(reservation)} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <Download className="h-4 w-4" />
            Apple / ICS
          </button>
          <a href={`mailto:${reservation.patients?.email ?? ""}?subject=${encodeURIComponent(appointmentText)}&body=${encodeURIComponent(message)}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <Mail className="h-4 w-4" />
            Enviar email
          </a>
          {phone && (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-3 text-sm font-semibold text-white">
              <MessageCircleMore className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getReservationColor(status: AppointmentReservationRow["status"]) {
  if (status === "Confirmada") return "#6e4a2f";
  if (status === "Pendiente") return "#b88a5a";
  if (status === "Realizada") return "#6f7a60";
  return "#9a6b43";
}

function getGoogleCalendarUrl(reservation: AppointmentReservationRow) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita ${reservation.appointment_type} - ${reservation.patients?.full_name ?? "Paciente"}`,
    dates: `${toCalendarDate(reservation.appointment_date, reservation.start_time)}/${toCalendarDate(reservation.appointment_date, reservation.end_time)}`,
    details: reservation.notes ?? "Cita agendada desde el panel de Dra. Estefany.",
    location: reservation.location ?? reservation.city,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(reservation: AppointmentReservationRow) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dra Estefany//Agenda//ES",
    "BEGIN:VEVENT",
    `UID:${reservation.id}@dra-estefany.local`,
    `DTSTAMP:${toCalendarDate(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 8))}`,
    `DTSTART:${toCalendarDate(reservation.appointment_date, reservation.start_time)}`,
    `DTEND:${toCalendarDate(reservation.appointment_date, reservation.end_time)}`,
    `SUMMARY:${escapeIcs(`Cita ${reservation.appointment_type} - ${reservation.patients?.full_name ?? "Paciente"}`)}`,
    `DESCRIPTION:${escapeIcs(reservation.notes ?? "Cita agendada desde el panel de Dra. Estefany.")}`,
    `LOCATION:${escapeIcs(reservation.location ?? reservation.city)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cita-${reservation.appointment_date}-${reservation.start_time.slice(0, 5).replace(":", "")}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

function toCalendarDate(date: string, time: string) {
  return `${date.replaceAll("-", "")}T${time.replaceAll(":", "").slice(0, 6)}`;
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
