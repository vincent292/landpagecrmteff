import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { AnimatedCard } from "../../components/ui/AnimatedCard";
import { CardSkeleton } from "../../components/ui/CardSkeleton";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { boliviaCities } from "../../data/cities";
import { getActivePromotions, type PromotionRow } from "../../services/promotionService";
import { formatMoney } from "../../utils/text";
import { PageIntro } from "./TreatmentsPage";

export function PromotionsPage() {
  const [interest, setInterest] = useState<PromotionRow | null>(null);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [city, setCity] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getActivePromotions()
      .then(setPromotions)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredPromotions = useMemo(() => promotions.filter((promo) => city === "Todas" || promo.city === city), [city, promotions]);

  return (
    <section className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-14 sm:px-6 md:px-8 md:py-24">
      <PageIntro eyebrow="Promociones" title="Beneficios activos para iniciar tu experiencia estética con claridad." />
      <div className="mt-8 w-full max-w-xs min-w-0"><select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input"><option>Todas</option>{boliviaCities.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mt-10 min-w-0 max-w-full sm:mt-12">
        {loading && (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <CardSkeleton key={index} variant="wide" />
            ))}
          </div>
        )}
        {error && <ErrorState />}
        {!loading && !error && filteredPromotions.length === 0 && <EmptyState />}
        {!loading && !error && filteredPromotions.length > 0 && (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2">
            {filteredPromotions.map((promo, index) => (
              <AnimatedCard key={promo.id} index={index}>
                <article className="grid min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)] transition-shadow duration-300 hover:shadow-[0_24px_62px_rgba(110,74,47,0.13)] sm:rounded-[30px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <ImageWithSkeleton src={promo.cover_image ?? "/doctora/dra1.jpg"} alt={promo.title} wrapperClassName="h-56 w-full sm:h-64 lg:h-full lg:min-h-[18rem]" />
                  <div className="min-w-0 p-5 sm:p-6">
                    <p className="break-words text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)] sm:tracking-[0.22em]">{promo.city}</p>
                    <h2 className="mt-3 break-words text-[1.55rem] font-semibold leading-tight sm:text-2xl">{promo.title}</h2>
                    <DoctorByline doctor={promo.doctor_profiles} />
                    <p className="mt-3 max-w-full break-words text-sm leading-7 text-[var(--color-copy)]">{promo.description}</p>
                    <div className="mt-5 flex min-w-0 flex-wrap items-end gap-3">
                      {promo.old_price != null && <span className="text-sm text-[var(--color-copy)] line-through">{formatMoney(promo.old_price)}</span>}
                      {promo.promo_price != null && <span className="break-words text-2xl font-semibold text-[var(--color-mocha)] sm:text-3xl">{formatMoney(promo.promo_price)}</span>}
                    </div>
                    <p className="mt-4 break-words text-sm leading-6 text-[var(--color-copy)]">Vigente hasta {promo.end_date ?? "por confirmar"} · {promo.available_slots ?? 0} cupos</p>
                    <button onClick={() => setInterest(promo)} className="mt-6 w-full max-w-full rounded-full bg-[var(--color-caramel)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(154,107,67,0.18)] transition hover:bg-[var(--color-mocha)] sm:w-auto sm:px-6">
                      Solicitar promoción
                    </button>
                  </div>
                </article>
              </AnimatedCard>
            ))}
          </div>
        )}
      </div>
      <InfoRequestModal open={Boolean(interest)} interest={interest?.title ?? ""} interestId={interest?.id} interestType="Promoción" onClose={() => setInterest(null)} />
    </section>
  );
}



