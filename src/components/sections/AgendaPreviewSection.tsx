import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCalendarEvents, type CalendarEventRow } from "../../services/calendarService";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function AgendaPreviewSection() {
  const [events, setEvents] = useState<CalendarEventRow[]>([]);

  useEffect(() => {
    getCalendarEvents().then((rows) => setEvents(rows.slice(0, 3))).catch(() => setEvents([]));
  }, []);

  return (
    <SectionReveal id="agenda" className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <SectionHeading
        eyebrow="Agenda"
        title="Ciudades, jornadas y actividades visibles en tiempo real."
        description="La agenda pública se alimenta desde el panel, para que el equipo publique valoraciones, cursos y jornadas sin tocar código."
        align="center"
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.7)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <img src={event.cover_image ?? "/doctora/dra3.jpg"} alt={event.title} className="h-72 w-full rounded-[22px] object-cover" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
              {event.event_type} · {event.city}
            </p>
            <h3 className="mt-2 text-2xl font-semibold">{event.title}</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              {event.event_date} · {event.start_time}
              <br />
              {event.location}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to="/agenda" className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-ink)]">
          Ver agenda completa
        </Link>
      </div>
    </SectionReveal>
  );
}
