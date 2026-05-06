import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { getPromotionBySlug, type PromotionRow } from "../../services/promotionService";
import { formatMoney } from "../../utils/text";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

export function PromotionDetailPage() {
  const { slug } = useParams();
  const [promotion, setPromotion] = useState<PromotionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getPromotionBySlug(slug)
      .then(setPromotion)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) return <Navigate to="/promociones" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState label="Cargando promoción..." /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState label="No pudimos cargar esta promoción." /></section>;
  if (!promotion) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos esta promoción." /></section>;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <img src={promotion.cover_image ?? "/doctora/dra1.jpg"} alt={promotion.title} className="w-full rounded-[30px] object-cover shadow-[0_24px_70px_rgba(62,42,31,0.16)]" />
        <div className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Promoción · {getDisplayCity(promotion.city)}
          </p>
          <h1 className="font-display mt-3 text-5xl font-semibold md:text-6xl">{promotion.title}</h1>
          <DoctorByline doctor={promotion.doctor_profiles} />
          <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{promotion.description}</p>
          <div className="mt-8 flex flex-wrap items-end gap-3">
            {promotion.old_price != null ? <span className="text-lg text-[var(--color-copy)] line-through">{formatMoney(promotion.old_price)}</span> : null}
            {promotion.promo_price != null ? <span className="text-3xl font-semibold text-[var(--color-mocha)]">{formatMoney(promotion.promo_price)}</span> : null}
          </div>
          <div className="mt-6 grid gap-3 text-sm leading-7 text-[var(--color-copy)] sm:grid-cols-2">
            <p>Inicio: {formatPublicDate(promotion.start_date)}</p>
            <p>Vigencia: {formatPublicDate(promotion.end_date)}</p>
            <p>Ciudad: {getDisplayCity(promotion.city)}</p>
            <p>Cupos disponibles: {promotion.available_slots ?? 0}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => setOpen(true)} className="rounded-full bg-[var(--color-caramel)] px-6 py-3 text-sm font-semibold text-white">
              Solicitar promoción
            </button>
            <Link to="/promociones" className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Volver a promociones
            </Link>
          </div>
        </div>
      </div>
      <InfoRequestModal open={open} interest={promotion.title} interestId={promotion.id} interestType="Promoción" onClose={() => setOpen(false)} />
    </section>
  );
}
