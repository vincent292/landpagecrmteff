import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { X } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { ContentCover } from "../../components/ui/ContentCover";
import { boliviaCities } from "../../data/cities";
import { getCalendarEvents } from "../../services/calendarService";
import { getCourses } from "../../services/courseService";
import { getActivePromotions } from "../../services/promotionService";
import {
  formatDateTimeLine,
  formatPublicDate,
  getDisplayCity,
  matchesAgendaType,
  normalizeAgendaType,
  publicAgendaTypes,
} from "../../utils/publicContent";
import { PageIntro } from "./TreatmentsPage";

type AgendaItem = {
  id: string;
  request_id: string;
  title: string;
  city: string | null;
  event_type: string;
  request_type: "Evento" | "Promoción" | "Academy";
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
        const merged: AgendaItem[] = [
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
            event_type: "Academy",
            request_type: "Academy" as const,
            event_date: course.start_date,
            end_date: null,
            start_time: course.start_time,
            location: course.city,
            description: course.short_description ?? course.description,
            cover_image: course.cover_image,
            available_slots: course.available_slots,
            doctor_profiles: course.doctor_profiles,
          })),
        ]
          .filter((item) => Boolean(item.event_date))
          .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));

        setAllEvents(merged);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const events = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          (city === "Todas" || getDisplayCity(event.city) === city) &&
          (type === "Todos" || matchesAgendaType(event.event_type, type))
      ),
    [allEvents, city, type]
  );

  const upcomingEvents = events.slice(0, 7);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro
        eyebrow="Agenda"
        title="Calendario de actividades, cursos, promociones y jornadas especiales."
        text="Mantuvimos la vista de calendario con previsualización lateral para revisar fechas y abrir el detalle desde el mismo flujo."
      />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todas</option>
          {boliviaCities.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todos</option>
          <option>Promoción</option>
          {publicAgendaTypes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="mt-10">
        {loading ? <LoadingState label="Cargando agenda..." /> : null}
        {error ? <ErrorState label="No pudimos cargar la agenda pública." /> : null}
        {!loading && !error && events.length === 0 ? <EmptyState label="Todavía no hay actividades publicadas para esos filtros." /> : null}
        {!loading && !error && events.length > 0 ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                height="auto"
                locale="es"
                events={events.map((event) => ({
                  id: event.id,
                  title: `${normalizeAgendaType(event.event_type)}: ${event.title}`,
                  start: event.event_date ?? undefined,
                  end: event.end_date ?? undefined,
                }))}
                eventClick={(info) => setSelected(events.find((event) => event.id === info.event.id) ?? null)}
              />
            </div>
            <aside className="space-y-4">
              <h2 className="text-2xl font-semibold text-[var(--color-ink)]">Próximas actividades</h2>
              {upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelected(event)}
                  className="w-full rounded-[24px] border border-[var(--color-border)] bg-white/60 p-5 text-left shadow-[0_18px_42px_rgba(62,42,31,0.06)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
                    {normalizeAgendaType(event.event_type)} · {getDisplayCity(event.city)}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--color-ink)]">{event.title}</h3>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">{formatDateTimeLine(event.event_date, event.start_time)}</p>
                </button>
              ))}
            </aside>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="grid max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] md:grid-cols-[0.9fr_1.1fr]">
            <ContentCover src={selected.cover_image} alt={selected.title} label={selected.request_type} wrapperClassName="h-full min-h-80 w-full" />
            <div className="p-6 md:p-8">
              <button type="button" onClick={() => setSelected(null)} className="float-right rounded-full border border-[var(--color-border)] p-2">
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                {normalizeAgendaType(selected.event_type)} · {getDisplayCity(selected.city)}
              </p>
              <h2 className="font-display mt-4 text-4xl font-semibold text-[var(--color-ink)]">{selected.title}</h2>
              <DoctorByline doctor={selected.doctor_profiles} />
              <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">{selected.description}</p>
              <div className="mt-5 space-y-2 text-sm leading-7 text-[var(--color-copy)]">
                <p>{formatDateTimeLine(selected.event_date, selected.start_time)}</p>
                <p>{selected.location ?? getDisplayCity(selected.city)}</p>
                <p>{selected.available_slots ?? 0} cupos disponibles</p>
                <p>Vigencia: {formatPublicDate(selected.event_date)}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => setInterest(selected)} className="rounded-full bg-[var(--color-caramel)] px-6 py-3 text-sm font-semibold text-white">
                  {selected.request_type === "Promoción" ? "Pedir información" : "Reservar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.request_id}
        interestType={interest?.request_type === "Academy" ? "Curso" : interest?.request_type ?? "Evento"}
        onClose={() => setInterest(null)}
      />
    </section>
  );
}
