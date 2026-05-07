import { useEffect, useState } from "react";
import { Star } from "lucide-react";

import { getTestimonials, type TestimonialRow } from "../../services/testimonialService";
import { getDisplayCity, getInitials } from "../../utils/publicContent";
import { ImageWithSkeleton } from "../ui/ImageWithSkeleton";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function TestimonialsSection() {
  const [items, setItems] = useState<TestimonialRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getTestimonials()
      .then((rows) => setItems(rows.slice(0, 6)))
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && items.length === 0) return null;

  return (
    <SectionReveal id="testimonios" className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-28">
      <SectionHeading
        eyebrow="Testimonios"
        title="Experiencias compartidas con respeto, cercanía y resultados reales."
        description="Cada proceso es distinto. Esta sección reúne testimonios autorizados que ayudan a conocer cómo se vive la atención antes, durante y después."
        align="center"
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            data-reveal
            className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.78)] p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]"
          >
            <div className="flex items-center gap-4">
              {item.image_url ? (
                <ImageWithSkeleton
                  src={item.image_url}
                  fallbackSrc="/doctora/dra1.jpg"
                  alt={item.full_name ?? "Testimonio"}
                  wrapperClassName="h-14 w-14 overflow-hidden rounded-full"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(198,162,123,0.22)] text-sm font-semibold text-[var(--color-ink)]">
                  {getInitials(item.full_name)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">{item.full_name ?? "Paciente"}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                  {getDisplayCity(item.city)}
                  {item.treatment_name ? ` · ${item.treatment_name}` : ""}
                </p>
              </div>
            </div>

            {item.rating ? (
              <div className="mt-4 flex items-center gap-1 text-[var(--color-caramel)]">
                {Array.from({ length: Math.max(1, Math.min(item.rating, 5)) }).map((_, index) => (
                  <Star key={index} className="h-4 w-4 fill-current" />
                ))}
              </div>
            ) : null}

            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              {item.content}
            </p>
          </article>
        ))}
      </div>
    </SectionReveal>
  );
}
