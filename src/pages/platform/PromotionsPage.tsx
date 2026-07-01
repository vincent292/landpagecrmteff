import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState } from "../../components/common/AsyncState";
import { Seo } from "../../components/common/Seo";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { AnimatedCard } from "../../components/ui/AnimatedCard";
import { CardSkeleton } from "../../components/ui/CardSkeleton";
import { ContentCover } from "../../components/ui/ContentCover";
import { boliviaCities } from "../../data/cities";
import {
  formatPromotionVariantSlots,
  getActivePromotions,
  getPromotionVariantRemainingSlots,
  type PromotionRow,
} from "../../services/promotionService";
import { formatMoney } from "../../utils/text";
import { formatPublicDate, getDisplayCity, isCurrentPromotion } from "../../utils/publicContent";
import { PageIntro } from "./TreatmentsPage";

export function PromotionsPage() {
  const [interest, setInterest] = useState<PromotionRow | null>(null);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [city, setCity] = useState("Todas");
  const [status, setStatus] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getActivePromotions()
      .then(setPromotions)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredPromotions = useMemo(
    () =>
      promotions.filter((promo) => {
        const cityOk = city === "Todas" || getDisplayCity(promo.city) === city;
        const statusOk =
          status === "Todas" ||
          (status === "Vigentes" && isCurrentPromotion(promo.end_date)) ||
          (status === "Por vencer" && Boolean(promo.end_date));
        return cityOk && statusOk;
      }),
    [city, promotions, status]
  );

  return (
    <section className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-14 sm:px-6 md:px-8 md:py-24">
      <Seo
        title="Promociones estéticas activas | Dra. Estefany Ballesteros"
        description="Consulta promociones estéticas activas, cupos disponibles y opciones para reservar o solicitar información directamente."
        path="/promociones"
        image="/doctora/dra5.jpg"
        keywords={["promociones estéticas", "promociones médicas", "reserva estética Bolivia"]}
      />
      <PageIntro
        eyebrow="Promociones"
        title="Promociones activas con variantes, cupos y posibilidad de reservar directo."
        text="Ahora cada promoción puede mostrar opciones distintas, pago completo o anticipo y seguimiento dentro del dashboard del paciente."
      />
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todas</option>
          {boliviaCities.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todas</option>
          <option>Vigentes</option>
          <option>Por vencer</option>
        </select>
      </div>

      <div className="mt-10 min-w-0 max-w-full sm:mt-12">
        {loading ? (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : null}
        {error ? <ErrorState /> : null}
        {!loading && !error && filteredPromotions.length === 0 ? <EmptyState label="Todavía no hay promociones activas para mostrar." /> : null}
        {!loading && !error && filteredPromotions.length > 0 ? (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredPromotions.map((promo, index) => {
              const variants = promo.promotion_variants ?? [];
              const lowestVariant = getLowestPriceVariant(variants);
              const hasVariants = variants.length > 0;
              const remaining = lowestVariant ? getPromotionVariantRemainingSlots(lowestVariant) : promo.available_slots ?? 0;

              return (
                <AnimatedCard key={promo.id} index={index}>
                  <article className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)] transition-shadow duration-300 hover:shadow-[0_24px_62px_rgba(110,74,47,0.13)] sm:rounded-[28px]">
                    <ContentCover src={promo.cover_image} alt={promo.title} label="Promoción" wrapperClassName="h-56 w-full sm:h-64" />
                    <div className="min-w-0 p-5 sm:p-6">
                      <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)] sm:tracking-[0.22em]">
                        {getDisplayCity(promo.city)}
                      </p>
                      <h2 className="mt-3 break-words text-[1.55rem] font-semibold leading-tight sm:text-2xl">{promo.title}</h2>
                      <DoctorByline doctor={promo.doctor_profiles} />
                      <p className="mt-3 max-w-full break-words text-sm leading-7 text-[var(--color-copy)]">{promo.description}</p>
                      <div className="mt-5 flex min-w-0 flex-wrap items-end gap-3">
                        {!hasVariants && promo.old_price != null ? <span className="text-sm text-[var(--color-copy)] line-through">{formatMoney(promo.old_price)}</span> : null}
                        {!hasVariants && promo.promo_price != null ? <span className="break-words text-2xl font-semibold text-[var(--color-mocha)] sm:text-3xl">{formatMoney(promo.promo_price)}</span> : null}
                        {lowestVariant ? <span className="break-words text-2xl font-semibold text-[var(--color-mocha)] sm:text-3xl">Opciones desde {formatMoney(lowestVariant.price_total)}</span> : null}
                      </div>
                      <p className="mt-4 break-words text-sm leading-6 text-[var(--color-copy)]">
                        Vigente hasta {formatPublicDate(promo.end_date)} · {lowestVariant ? formatPromotionVariantSlots(lowestVariant) : `${remaining} cupos`}
                      </p>
                      <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
                        {promo.requires_assessment ? (
                          <Link to={`/promociones/${promo.slug}?accion=valoracion`} className="rounded-full bg-[var(--color-caramel)] px-5 py-3 text-center text-sm font-semibold text-white">
                            Reservar valoración
                          </Link>
                        ) : (
                          <Link to={`/promociones/${promo.slug}?accion=reservar`} className="rounded-full bg-[var(--color-caramel)] px-5 py-3 text-center text-sm font-semibold text-white">
                            Reservar y pagar
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => setInterest(promo)}
                          className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold"
                        >
                          Pedir información
                        </button>
                        <Link to={`/promociones/${promo.slug}`} className="rounded-full border border-[var(--color-border)] px-5 py-3 text-center text-sm font-semibold">
                          Ver promoción
                        </Link>
                      </div>
                    </div>
                  </article>
                </AnimatedCard>
              );
            })}
          </div>
        ) : null}
      </div>

      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType="Promoción"
        whatsappTemplate={interest?.whatsapp_prefill_message ?? null}
        contentPrice={interest?.promo_price ?? null}
        contentCity={interest?.city ?? null}
        onClose={() => setInterest(null)}
      />
    </section>
  );
}

function getLowestPriceVariant(variants: PromotionRow["promotion_variants"]) {
  return [...(variants ?? [])].sort((a, b) => Number(a.price_total ?? 0) - Number(b.price_total ?? 0))[0] ?? null;
}
