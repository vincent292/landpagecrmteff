import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
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
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Promociones" title="Beneficios activos para iniciar tu experiencia estética con claridad." />
      <div className="mt-8 max-w-xs"><select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input"><option>Todas</option>{boliviaCities.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mt-12">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && filteredPromotions.length === 0 && <EmptyState />}
        <div className="grid gap-6 md:grid-cols-2">
          {filteredPromotions.map((promo) => (
            <article key={promo.id} className="grid overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)] lg:grid-cols-[0.9fr_1.1fr]">
              <img src={promo.cover_image ?? "/doctora/dra1.jpg"} alt={promo.title} className="h-full min-h-72 w-full object-cover" />
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{promo.city}</p>
                <h2 className="mt-3 text-2xl font-semibold">{promo.title}</h2>
                <DoctorByline doctor={promo.doctor_profiles} />
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{promo.description}</p>
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  {promo.old_price != null && <span className="text-sm text-[var(--color-copy)] line-through">{formatMoney(promo.old_price)}</span>}
                  {promo.promo_price != null && <span className="text-3xl font-semibold text-[var(--color-mocha)]">{formatMoney(promo.promo_price)}</span>}
                </div>
                <p className="mt-4 text-sm text-[var(--color-copy)]">Vigente hasta {promo.end_date ?? "por confirmar"} · {promo.available_slots ?? 0} cupos</p>
                <button onClick={() => setInterest(promo)} className="mt-6 rounded-full bg-[var(--color-caramel)] px-6 py-3 text-sm font-semibold text-white">
                  Solicitar promoción
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <InfoRequestModal open={Boolean(interest)} interest={interest?.title ?? ""} interestId={interest?.id} interestType="Promoción" onClose={() => setInterest(null)} />
    </section>
  );
}



