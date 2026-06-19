import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { InfoRequestModal } from "../platform/InfoRequestModal";
import { AnimatedCard } from "../ui/AnimatedCard";
import { ContentCover } from "../ui/ContentCover";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";
import { getActivePromotions, type PromotionRow } from "../../services/promotionService";
import { getCourses, type CourseRow } from "../../services/courseService";
import {
  getFeaturedTreatments,
  getTreatments,
  type TreatmentRow,
} from "../../services/treatmentService";
import { formatMoney } from "../../utils/text";
import { formatDateTimeLine, getDisplayCity, isCurrentPromotion, normalizeAgendaType } from "../../utils/publicContent";

type HighlightCard =
  | {
      kind: "Tratamiento";
      id: string;
      title: string;
      description: string;
      image: string | null;
      category: string;
      primaryLabel: string;
      moreHref: string;
      interestType: "Tratamiento";
      payload: TreatmentRow;
    }
  | {
      kind: "Promocion";
      id: string;
      title: string;
      description: string;
      image: string | null;
      category: string;
      primaryLabel: string;
      moreHref: string;
      interestType: "Promoción";
      payload: PromotionRow;
    }
  | {
      kind: "Academy";
      id: string;
      title: string;
      description: string;
      image: string | null;
      category: string;
      primaryLabel: string;
      moreHref: string;
      interestType: "Curso";
      payload: CourseRow;
    };

export function Services() {
  const [interest, setInterest] = useState<HighlightCard | null>(null);
  const [cards, setCards] = useState<HighlightCard[]>([]);

  useEffect(() => {
    let active = true;

    Promise.all([
      getFeaturedTreatments().then((rows) => rows[0] ?? null).catch(async () => (await getTreatments())[0] ?? null),
      getActivePromotions().then((rows) => rows.find((item) => isCurrentPromotion(item.end_date)) ?? rows[0] ?? null),
      getCourses().then((rows) => rows[0] ?? null),
    ])
      .then(([treatment, promotion, course]) => {
        if (!active) return;

        const nextCards: HighlightCard[] = [];

        if (treatment) {
          nextCards.push({
            kind: "Tratamiento",
            id: treatment.id,
            title: treatment.title,
            description: treatment.short_description ?? treatment.description ?? "Informacion disponible en el detalle del tratamiento.",
            image: treatment.cover_image,
            category: treatment.city ? `Tratamiento · ${getDisplayCity(treatment.city)}` : "Tratamiento destacado",
            primaryLabel: treatment.requires_assessment ? "Reservar valoracion" : "Pedir informacion",
            moreHref: treatment.requires_assessment ? `/tratamientos/${treatment.slug}?accion=valoracion` : `/tratamientos/${treatment.slug}`,
            interestType: "Tratamiento",
            payload: treatment,
          });
        }

        if (promotion) {
          nextCards.push({
            kind: "Promocion",
            id: promotion.id,
            title: promotion.title,
            description: promotion.description ?? "Consulta la vigencia y las condiciones de esta promocion desde el detalle.",
            image: promotion.cover_image,
            category: `Promocion · ${getDisplayCity(promotion.city)}`,
            primaryLabel: promotion.requires_assessment ? "Reservar valoracion" : "Pedir informacion",
            moreHref: `/promociones/${promotion.slug}`,
            interestType: "Promoción",
            payload: promotion,
          });
        }

        if (course) {
          nextCards.push({
            kind: "Academy",
            id: course.id,
            title: course.title,
            description: course.short_description ?? course.description ?? "Revisa el contenido, la modalidad y la fecha del programa.",
            image: course.cover_image,
            category: `${getDisplayCity(course.city)} · ${normalizeAgendaType(course.modality ?? "Curso")}`,
            primaryLabel: "Inscribirme",
            moreHref: `/academy/${course.slug}`,
            interestType: "Curso",
            payload: course,
          });
        }

        setCards(nextCards);
      })
      .catch(() => setCards([]));

    return () => {
      active = false;
    };
  }, []);

  const actionLinks = useMemo(
    () => [
      { href: "/tratamientos", label: "Ver tratamientos" },
      { href: "/promociones", label: "Ver promociones" },
      { href: "/academy", label: "Ver Academy" },
    ],
    []
  );

  if (cards.length === 0) {
    return (
      <SectionReveal id="servicios" className="mx-auto max-w-7xl px-6 py-28 md:px-8 md:py-36">
        <SectionHeading
          eyebrow="Servicios"
          title="Tratamientos, promociones y Academy conectados al panel de forma centralizada."
          description="Cuando el equipo publique nuevo contenido desde administración, se mostrará aquí automáticamente."
          align="center"
        />
      </SectionReveal>
    );
  }

  return (
    <SectionReveal id="servicios" className="mx-auto max-w-7xl px-6 py-28 md:px-8 md:py-36">
      <SectionHeading
        eyebrow="Servicios"
        title="Medicina estetica, armonizacion facial y formacion en Bolivia."
        description="Explora tratamientos de medicina estetica, promociones activas y cursos con informacion clara para pacientes y profesionales en Bolivia."
        align="center"
      />

      <div className={`mt-16 grid gap-6 ${cards.length > 1 ? "lg:grid-cols-3" : "max-w-3xl mx-auto"}`}>
        {cards.map((card, index) => (
          <AnimatedCard key={`${card.kind}-${card.id}`} index={index} className="group h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.78)] shadow-[0_20px_58px_rgba(62,42,31,0.08)] transition-shadow duration-300 group-hover:shadow-[0_26px_68px_rgba(62,42,31,0.12)]">
              <ContentCover src={card.image} alt={card.title} label={card.kind} wrapperClassName="h-72 w-full" />
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
                  {card.category}
                </p>
                <h3 className="mt-3 text-[1.7rem] font-semibold leading-tight text-[var(--color-ink)]">
                  {card.title}
                </h3>
                <p className="mt-4 flex-1 text-sm leading-7 text-[var(--color-copy)]">{card.description}</p>

                {card.kind === "Promocion" ? (
                  <div className="mt-5 flex items-center gap-3 text-sm text-[var(--color-copy)]">
                    {card.payload.old_price != null ? (
                      <span className="line-through">{formatMoney(card.payload.old_price)}</span>
                    ) : null}
                    {card.payload.promo_price != null ? (
                      <span className="text-lg font-semibold text-[var(--color-mocha)]">
                        {formatMoney(card.payload.promo_price)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {card.kind === "Academy" ? (
                  <p className="mt-5 text-sm text-[var(--color-copy)]">
                    {formatDateTimeLine(card.payload.start_date, card.payload.start_time)}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {card.kind === "Academy" ? (
                    <Link
                      to={card.moreHref}
                      className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      {card.primaryLabel}
                    </Link>
                  ) : card.kind === "Tratamiento" && card.payload.requires_assessment ? (
                    <Link
                      to={card.moreHref}
                      className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      {card.primaryLabel}
                    </Link>
                  ) : card.kind === "Promocion" && card.payload.requires_assessment ? (
                    <Link
                      to={`/promociones/${card.payload.slug}?accion=valoracion`}
                      className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      {card.primaryLabel}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInterest(card)}
                      className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
                    >
                      {card.primaryLabel}
                    </button>
                  )}
                  <Link
                    to={card.kind === "Promocion" && card.payload.requires_assessment ? `/promociones/${card.payload.slug}` : card.moreHref}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
                  >
                    Ver mas
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </article>
          </AnimatedCard>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {actionLinks.map((item) => (
          <Link
            key={item.href}
            data-reveal
            to={item.href}
            className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType={interest?.interestType ?? "General"}
        whatsappTemplate={interest?.payload.whatsapp_prefill_message ?? null}
        contentPrice={
          interest?.kind === "Promocion"
            ? interest.payload.promo_price ?? null
            : interest?.kind === "Academy"
              ? interest.payload.price ?? null
              : null
        }
        contentCity={interest?.payload.city ?? null}
        onClose={() => setInterest(null)}
      />
    </SectionReveal>
  );
}
