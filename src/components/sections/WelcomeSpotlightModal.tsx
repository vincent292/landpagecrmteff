import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ArrowLeft, ArrowRight, Tag, X } from "lucide-react";
import gsap from "gsap";

import { getActiveBooks, type BookRow } from "../../services/bookService";
import { getCourses, type CourseRow } from "../../services/courseService";
import { getActivePromotions, type PromotionRow } from "../../services/promotionService";
import {
  getFeaturedTreatments,
  getTreatments,
  type TreatmentRow,
} from "../../services/treatmentService";
import {
  formatDateTimeLine,
  getDisplayCity,
  isCurrentPromotion,
} from "../../utils/publicContent";
import { formatMoney } from "../../utils/text";
import { ContentCover } from "../ui/ContentCover";

type SpotlightItem = {
  id: string;
  kind: "Promocion" | "Tratamiento" | "Curso" | "Libro";
  title: string;
  description: string;
  image: string | null;
  href: string;
  badge: string;
  meta: string;
  ctaLabel: string;
};

type WelcomeSpotlightModalProps = {
  enabled?: boolean;
};

function truncate(value?: string | null, max = 180) {
  const text = value?.trim() ?? "";
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function buildPromotionItems(rows: PromotionRow[]) {
  return rows
    .filter((item) => isCurrentPromotion(item.end_date))
    .slice(0, 2)
    .map<SpotlightItem>((promotion) => ({
      id: `promotion-${promotion.id}`,
      kind: "Promocion",
      title: promotion.title,
      description:
        truncate(promotion.description, 170) ||
        "Revisa esta promocion activa y aprovecha sus condiciones vigentes.",
      image: promotion.cover_image,
      href: `/promociones/${promotion.slug}`,
      badge: "Promocion destacada",
      meta:
        promotion.promo_price != null
          ? `${getDisplayCity(promotion.city)} · ${formatMoney(promotion.promo_price)}`
          : getDisplayCity(promotion.city),
      ctaLabel: "Ver promocion",
    }));
}

function buildTreatmentItems(rows: TreatmentRow[]) {
  return rows.slice(0, 3).map<SpotlightItem>((treatment) => ({
    id: `treatment-${treatment.id}`,
    kind: "Tratamiento",
    title: treatment.title,
    description:
      truncate(treatment.short_description ?? treatment.description, 170) ||
      "Conoce este tratamiento disponible y descubre si es el indicado para ti.",
    image: treatment.cover_image,
    href: `/tratamientos/${treatment.slug}`,
    badge: "Tratamiento recomendado",
    meta: getDisplayCity(treatment.city),
    ctaLabel: "Ver tratamiento",
  }));
}

function buildCourseItems(rows: CourseRow[]) {
  return rows.slice(0, 2).map<SpotlightItem>((course) => ({
    id: `course-${course.id}`,
    kind: "Curso",
    title: course.title,
    description:
      truncate(course.short_description ?? course.description, 170) ||
      "Explora este curso activo y revisa su modalidad, fecha y contenido.",
    image: course.cover_image,
    href: `/cursos/${course.slug}`,
    badge: "Curso disponible",
    meta: formatDateTimeLine(course.start_date, course.start_time),
    ctaLabel: "Ver curso",
  }));
}

function buildBookItems(rows: BookRow[]) {
  return rows.slice(0, 2).map<SpotlightItem>((book) => ({
    id: `book-${book.id}`,
    kind: "Libro",
    title: book.title,
    description:
      truncate(book.description, 170) ||
      "Descubre este libro disponible y accede a su detalle para revisar la compra.",
    image: book.cover_image,
    href: `/libros/${book.slug}`,
    badge: "Libro disponible",
    meta: `${book.author} · ${formatMoney(book.price)}`,
    ctaLabel: "Ver libro",
  }));
}

export function WelcomeSpotlightModal({ enabled = true }: WelcomeSpotlightModalProps) {
  const [items, setItems] = useState<SpotlightItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let active = true;
    let timerId: number | null = null;

    Promise.all([
      getActivePromotions().catch(() => [] as PromotionRow[]),
      getFeaturedTreatments().catch(() => [] as TreatmentRow[]),
      getTreatments().catch(() => [] as TreatmentRow[]),
      getCourses().catch(() => [] as CourseRow[]),
      getActiveBooks().catch(() => [] as BookRow[]),
    ]).then(([promotions, featuredTreatments, allTreatments, courses, books]) => {
      if (!active) return;

      const treatmentSource = featuredTreatments.length > 0 ? featuredTreatments : allTreatments;
      const spotlightItems = [
        ...buildPromotionItems(promotions),
        ...buildTreatmentItems(treatmentSource),
        ...buildCourseItems(courses),
        ...buildBookItems(books),
      ];

      if (spotlightItems.length === 0) return;

      setItems(spotlightItems);
      setCurrentIndex(0);
      timerId = window.setTimeout(() => {
        setOpen(true);
      }, 700);
    });

    return () => {
      active = false;
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [enabled]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    const modal = modalRef.current;
    const media = mediaRef.current;
    const content = contentRef.current;
    const text = textRef.current;
    if (!overlay || !modal || !media || !content || !text) return;

    const ctx = gsap.context(() => {
      gsap.set([modal, media, content], { willChange: "transform, opacity" });
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 })
        .fromTo(
          modal,
          { autoAlpha: 0, y: 28, scale: 0.97, filter: "blur(14px)" },
          { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.55 },
          0
        )
        .fromTo(
          media,
          { x: -20, scale: 1.03, autoAlpha: 0.92 },
          { x: 0, scale: 1, autoAlpha: 1, duration: 0.62 },
          0.08
        )
        .fromTo(
          text.children,
          { autoAlpha: 0, y: 18, filter: "blur(8px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.42, stagger: 0.05 },
          0.16
        );
    }, modal);

    return () => ctx.revert();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const media = mediaRef.current;
    const content = contentRef.current;
    const text = textRef.current;
    if (!media || !content || !text) return;

    const ctx = gsap.context(() => {
      gsap.killTweensOf([media, content, text.children]);
      gsap.set([media, content], { willChange: "transform, opacity" });
      gsap.fromTo(
        media,
        { x: 26, autoAlpha: 0.84, scale: 1.025, filter: "blur(10px)" },
        {
          x: 0,
          autoAlpha: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.52,
          ease: "power3.out",
        }
      );
      gsap.fromTo(
        content,
        { x: 18, autoAlpha: 0.92 },
        {
          x: 0,
          autoAlpha: 1,
          duration: 0.42,
          ease: "power2.out",
        }
      );
      gsap.fromTo(
        text.children,
        { autoAlpha: 0, y: 16, filter: "blur(8px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.38,
          stagger: 0.04,
          ease: "power3.out",
        }
      );
    });

    return () => ctx.revert();
  }, [currentIndex, open]);

  if (!open || items.length === 0 || typeof document === "undefined") return null;

  const currentItem = items[currentIndex];
  const multiple = items.length > 1;

  const goPrev = () => {
    setCurrentIndex((index) => (index === 0 ? items.length - 1 : index - 1));
  };

  const goNext = () => {
    setCurrentIndex((index) => (index === items.length - 1 ? 0 : index + 1));
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(43,33,27,0.42)] px-4 py-8 backdrop-blur-md"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-5xl overflow-hidden rounded-[34px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.97)] shadow-[0_34px_90px_rgba(43,33,27,0.28)]"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/70"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid md:grid-cols-[0.92fr_1.08fr]">
          <div ref={mediaRef} className="relative">
            <ContentCover
              src={currentItem.image}
              alt={currentItem.title}
              label={currentItem.kind}
              wrapperClassName="min-h-[290px] md:min-h-[560px]"
              className="h-full w-full object-cover"
            />

            {multiple ? (
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 px-4">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${
                      index === currentIndex
                        ? "w-8 bg-white"
                        : "w-2.5 bg-white/55"
                    }`}
                    aria-label={`Ir al destacado ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div ref={contentRef} className="relative p-6 md:p-8">
            <div ref={textRef} className="contents">
            <div className="flex items-center gap-3">
              {multiple ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-mocha)]">
                  {String(currentIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </div>
              ) : null}
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                <Tag className="h-3.5 w-3.5" />
                {currentItem.badge}
              </div>
            </div>

            <h2 className="font-display mt-5 text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl">
              {currentItem.title}
            </h2>

            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-mocha)]">
              {currentItem.meta}
            </p>

            <p className="mt-5 text-base leading-8 text-[var(--color-copy)]">
              {currentItem.description}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={currentItem.href}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(62,42,31,0.18)]"
              >
                {currentItem.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--color-border)] px-6 py-3.5 text-sm font-semibold text-[var(--color-ink)]"
              >
                Cerrar
              </button>
            </div>

            {multiple ? (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-6">
                <p className="text-sm text-[var(--color-copy)]">
                  Desliza entre promociones, tratamientos, cursos y libros destacados.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/65 text-[var(--color-ink)]"
                    aria-label="Anterior"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-caramel)] text-white shadow-[0_16px_34px_rgba(110,74,47,0.18)]"
                    aria-label="Siguiente"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
