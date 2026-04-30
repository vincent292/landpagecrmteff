import { useEffect, useMemo, useState } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { X } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { getCalendarEvents } from "../../services/calendarService";
import { getCourses } from "../../services/courseService";
import { getActivePromotions } from "../../services/promotionService";
import { PageIntro } from "./TreatmentsPage";

type AgendaItem = {
  id: string;
  request_id: string;
  title: string;
  city: string | null;
  event_type: string;
  request_type: "Evento" | "Promoción" | "Curso";
  event_date: string | null;
  end_date?: string | null;
  start_time: string | null;
  location: string | null;
  description: string | null;
  cover_image: string | null;
  available_slots: number | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
};

export function AgendaPage() {
  const [city, setCity] = useState("Todas");
  const [type, setType] = useState("Todos");
  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [interest, setInterest] = useState<AgendaItem | null>(null);
  const [allEvents, setAllEvents] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([getCalendarEvents(), getActivePromotions(), getCourses()])
      .then(([events, promotions, courses]) => {
        setAllEvents([
          ...events.map((event) => ({
            id: event.id,
            request_id: event.id,
            title: event.title,
            city: event.city,
            event_type: event.event_type ?? "Evento",
            request_type: "Evento" as const,
            event_date: event.event_date,
            end_date: event.end_time ? event.event_date : null,
            start_time: event.start_time,
            location: event.location,
            description: event.description,
            cover_image: event.cover_image,
            available_slots: event.available_slots,
            doctor_profiles: event.doctor_profiles,
          })),
          ...promotions.map((promo) => ({
            id: `promo-${promo.id}`,
            request_id: promo.id,
            title: promo.title,
            city: promo.city,
            event_type: "Promoción",
            request_type: "Promoción" as const,
            event_date: promo.start_date,
            end_date: promo.end_date,
            start_time: null,
            location: promo.city,
            description: promo.description,
            cover_image: promo.cover_image,
            available_slots: promo.available_slots,
            doctor_profiles: promo.doctor_profiles,
          })),
          ...courses.map((course) => ({
            id: `course-${course.id}`,
            request_id: course.id,
            title: course.title,
            city: course.city,
            event_type: "Curso",
            request_type: "Curso" as const,
            event_date: course.start_date,
            end_date: null,
            start_time: course.start_time,
            location: course.city,
            description: course.short_description ?? course.description,
            cover_image: course.cover_image,
            available_slots: course.available_slots,
            doctor_profiles: course.doctor_profiles,
          })),
        ]);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const events = useMemo(
    () =>
      allEvents.filter(
        (event) => (city === "Todas" || event.city === city) && (type === "Todos" || event.event_type === type)
      ),
    [allEvents, city, type]
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Agenda" title="Calendario de actividades, cursos y jornadas especiales." />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todas</option>
          {[...new Set(allEvents.map((event) => event.city).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todos</option>
          <option>Curso</option>
          <option>Promoción</option>
          <option>Procedimiento</option>
          <option>Cirugía</option>
          <option>Presentación</option>
          <option>Jornada</option>
          <option>Valoración</option>
        </select>
      </div>
      <div className="mt-10">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && events.length === 0 && <EmptyState />}
        {!loading && !error && events.length > 0 && (
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                height="auto"
                events={events.map((event) => ({
                  id: event.id,
                  title: `${event.event_type}: ${event.title}`,
                  start: event.event_date ?? undefined,
                  end: event.end_date ?? undefined,
                }))}
                eventClick={(info) => setSelected(events.find((event) => event.id === info.event.id) ?? null)}
              />
            </div>
            <aside className="space-y-4">
              <h2 className="text-2xl font-semibold">Próximas actividades</h2>
              {events.map((event) => (
                <button key={event.id} onClick={() => setSelected(event)} className="w-full rounded-[24px] border border-[var(--color-border)] bg-white/60 p-5 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">{event.event_type} · {event.city}</p>
                  <h3 className="mt-2 text-lg font-semibold">{event.title}</h3>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">{event.event_date} · {event.start_time}</p>
                </button>
              ))}
            </aside>
          </div>
        )}
      </div>
      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="grid max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] md:grid-cols-[0.9fr_1.1fr]">
            <img src={selected.cover_image ?? "/doctora/dra3.jpg"} alt={selected.title} className="h-full min-h-80 w-full object-cover" />
            <div className="p-6 md:p-8">
              <button onClick={() => setSelected(null)} className="float-right rounded-full border border-[var(--color-border)] p-2"><X className="h-5 w-5" /></button>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{selected.event_type} · {selected.city}</p>
              <h2 className="font-display mt-4 text-5xl font-semibold">{selected.title}</h2>
              <DoctorByline doctor={selected.doctor_profiles} />
              <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">{selected.description}</p>
              <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">{selected.event_date} · {selected.start_time}<br />{selected.location}<br />{selected.available_slots ?? 0} cupos</p>
              <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setInterest(selected)} className="rounded-full bg-[var(--color-caramel)] px-6 py-3 text-sm font-semibold text-white">Pedir más información</button></div>
            </div>
          </div>
        </div>
      )}
      <InfoRequestModal open={Boolean(interest)} interest={interest?.title ?? ""} interestId={interest?.request_id} interestType={interest?.request_type ?? "Evento"} onClose={() => setInterest(null)} />
    </section>
  );
}



