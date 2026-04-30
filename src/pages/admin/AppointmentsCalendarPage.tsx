import { useEffect, useMemo, useState } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Download, ExternalLink, Mail, MessageCircleMore, Search } from "lucide-react";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { getReservationsAdmin, type AppointmentReservationRow } from "../../services/reservationService";
import { formatDate } from "../../utils/text";

const statuses = ["Todos", "Pendiente", "Confirmada", "Realizada", "Cancelada", "Rechazada"];

export function AppointmentsCalendarPage() {
  const [reservations, setReservations] = useState<AppointmentReservationRow[]>([]);
  const [selected, setSelected] = useState<AppointmentReservationRow | null>(null);
  const [status, setStatus] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReservationsAdmin()
      .then(setReservations)
      .finally(() => setLoading(false));
  }, []);

  const filteredReservations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reservations.filter((item) => {
      const matchesStatus = status === "Todos" || item.status === status;
      const matchesQuery =
        !normalizedQuery ||
        JSON.stringify({
          patient: item.patients,
          type: item.appointment_type,
          city: item.city,
          date: item.appointment_date,
        })
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [query, reservations, status]);

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              Calendario de citas
            </p>
            <h1 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">
              Agenda clinica de doctoras
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
              Revisa las citas por mes, semana o dia y abre cada reserva para notificar o exportar al calendario.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="premium-input pl-11"
              placeholder="Buscar paciente, ciudad, fecha o tipo"
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="premium-input">
            {statuses.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-3 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-5">
          {loading && <LoadingState label="Cargando citas..." />}
          {!loading && filteredReservations.length === 0 && <EmptyState label="No hay citas con esos filtros." />}
          {!loading && filteredReservations.length > 0 && (
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,dayGridWeek,dayGridDay",
              }}
              buttonText={{
                today: "Hoy",
                month: "Mes",
                week: "Semana",
                day: "Dia",
              }}
              height="auto"
              events={filteredReservations.map((item) => ({
                id: item.id,
                title: `${item.start_time.slice(0, 5)} ${item.patients?.full_name ?? "Paciente"}`,
                start: `${item.appointment_date}T${item.start_time}`,
                end: `${item.appointment_date}T${item.end_time}`,
                color: getReservationColor(item.status),
              }))}
              eventClick={(info) => setSelected(filteredReservations.find((item) => item.id === info.event.id) ?? null)}
              dateClick={(info) => {
                const dayReservation = filteredReservations.find((item) => item.appointment_date === info.dateStr);
                if (dayReservation) setSelected(dayReservation);
              }}
            />
          )}
        </div>

        <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <h2 className="text-xl font-semibold">Citas proximas</h2>
          <div className="mt-5 grid gap-3">
            {filteredReservations.slice(0, 8).map((reservation) => (
              <button
                key={reservation.id}
                onClick={() => setSelected(reservation)}
                className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] p-4 text-left"
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
          </div>
        </aside>
      </section>

      {selected && <AppointmentModal reservation={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AppointmentModal({ reservation, onClose }: { reservation: AppointmentReservationRow; onClose: () => void }) {
  const patientName = reservation.patients?.full_name ?? "Paciente";
  const doctorWhatsapp = (reservation.doctor_profiles?.whatsapp ?? "").replace(/\D/g, "");
  const title = `Cita ${reservation.appointment_type} - ${patientName}`;
  const message = `Nueva cita para ${reservation.doctor_profiles?.full_name ?? "doctora"}: ${patientName}, ${reservation.appointment_type}, ${formatDate(reservation.appointment_date)} de ${reservation.start_time.slice(0, 5)} a ${reservation.end_time.slice(0, 5)}.`;

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
          <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            <Mail className="h-4 w-4" />
            Email doctora
          </a>
          {doctorWhatsapp && (
            <a href={`https://wa.me/${doctorWhatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-3 text-sm font-semibold text-white">
              <MessageCircleMore className="h-4 w-4" />
              WhatsApp doctora
            </a>
          )}
          {!doctorWhatsapp && (
            <span className="rounded-full border border-[var(--color-border)] bg-white/60 px-4 py-3 text-center text-sm font-semibold text-[var(--color-copy)]">
              Asigna una doctora para WhatsApp
            </span>
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
