import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, X } from "lucide-react";

import { InfoRequestModal } from "../platform/InfoRequestModal";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";
import { getCalendarEvents, type CalendarEventRow } from "../../services/calendarService";
import {
  formatDateTimeLine,
  getDisplayCity,
  normalizeAgendaType,
} from "../../utils/publicContent";

export function AgendaPreviewSection() {
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [selected, setSelected] = useState<CalendarEventRow | null>(null);
  const [interest, setInterest] = useState<CalendarEventRow | null>(null);

  useEffect(() => {
    getCalendarEvents()
      .then((rows) =>
        setEvents(
          rows
            .filter((item) => Boolean(item.event_date))
            .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
            .slice(0, 3)
        )
      )
      .catch(() => setEvents([]));
  }, []);

  return (
    <SectionReveal id="agenda" className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <SectionHeading
        eyebrow="Agenda"
        title="Próximas actividades publicadas desde la agenda real del consultorio."
        description="Esta vista toma los mismos eventos que se administran desde el panel, para que la información pública y operativa se mantenga sincronizada."
        align="center"
      />

      {events.length > 0 ? (
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {events.map((event) => (
            <article
              key={event.id}
              data-reveal
              className="flex flex-col rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.76)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]"
            >
              <img
                src={event.cover_image ?? "/doctora/dra3.jpg"}
                alt={event.title}
                loading="lazy"
                decoding="async"
                className="h-72 w-full rounded-[22px] object-cover"
              />
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                <CalendarDays className="h-4 w-4" />
                <span>{normalizeAgendaType(event.event_type)} · {getDisplayCity(event.city)}</span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{event.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{event.description}</p>
              <div className="mt-4 space-y-2 text-sm text-[var(--color-copy)]">
                <p>{formatDateTimeLine(event.event_date, event.start_time)}</p>
                <p className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {event.location ?? getDisplayCity(event.city)}
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setSelected(event)}
                  className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
                >
                  Ver detalle
                </button>
                <button
                  type="button"
                  onClick={() => setInterest(event)}
                  className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
                >
                  Reservar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div
          data-reveal
          className="mx-auto mt-14 max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.74)] p-8 text-center text-sm leading-7 text-[var(--color-copy)]"
        >
          La agenda pública no tiene eventos próximos en este momento. En cuanto el equipo publique nuevas fechas desde el panel, aparecerán aquí automáticamente.
        </div>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          data-reveal
          to="/agenda"
          className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
        >
          Ver agenda completa
        </Link>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="grid max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] md:grid-cols-[0.95fr_1.05fr]">
            <img src={selected.cover_image ?? "/doctora/dra3.jpg"} alt={selected.title} className="h-full min-h-80 w-full object-cover" />
            <div className="p-6 md:p-8">
              <button type="button" onClick={() => setSelected(null)} className="float-right rounded-full border border-[var(--color-border)] p-2">
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                {normalizeAgendaType(selected.event_type)} · {getDisplayCity(selected.city)}
              </p>
              <h3 className="font-display mt-4 text-4xl font-semibold text-[var(--color-ink)]">{selected.title}</h3>
              <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">{selected.description}</p>
              <div className="mt-5 space-y-2 text-sm text-[var(--color-copy)]">
                <p>{formatDateTimeLine(selected.event_date, selected.start_time)}</p>
                <p>{selected.location ?? getDisplayCity(selected.city)}</p>
                <p>{selected.available_slots ?? 0} cupos disponibles</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setInterest(selected);
                }}
                className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
              >
                Pedir informacion
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType="Evento"
        onClose={() => setInterest(null)}
      />
    </SectionReveal>
  );
}
