import { useEffect, useState } from "react";

import { Navigate, useParams } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { getTreatmentBySlug, type TreatmentRow } from "../../services/treatmentService";
import { listFromText } from "../../utils/text";

type TreatmentDetail = TreatmentRow & { treatment_images?: { image_url: string; alt_text?: string | null }[] };

export function TreatmentDetailPage() {
  const { slug } = useParams();
  const [treatment, setTreatment] = useState<TreatmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getTreatmentBySlug(slug)
      .then(setTreatment)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) return <Navigate to="/tratamientos" replace />;

  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!treatment) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este tratamiento." /></section>;

  const gallery = [
    treatment.cover_image ?? "/doctora/dra2.jpg",
    ...(treatment.treatment_images?.map((image) => image.image_url) ?? []),
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="overflow-hidden rounded-[34px] border border-[var(--color-border)] bg-white/60 p-3">
          <Swiper spaceBetween={12}>
            {gallery.map((image) => (
              <SwiperSlide key={image}>
                <img src={image} alt={treatment.title} className="h-[520px] w-full rounded-[26px] object-cover" />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Tratamiento</p>
          <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.95] md:text-7xl">{treatment.title}</h1>
          <DoctorByline doctor={treatment.doctor_profiles} />
          <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{treatment.description}</p>
          <p className="mt-5 rounded-2xl bg-white/60 p-4 text-sm text-[var(--color-copy)]">Duración aproximada: <strong className="text-[var(--color-ink)]">{treatment.duration}</strong></p>
          <button onClick={() => setOpen(true)} className="mt-8 rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white">
            Necesito más información
          </button>
        </div>
      </div>
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        <DetailBlock title="Beneficios" items={listFromText(treatment.benefits)} />
        <DetailBlock title="Cuidados antes y después" items={listFromText(treatment.care_instructions)} />
        <DetailBlock title="Resultados esperados" items={listFromText(treatment.expected_results)} />
      </div>
      <InfoRequestModal open={open} interest={treatment.title} interestId={treatment.id} interestType="Tratamiento" onClose={() => setOpen(false)} />
    </section>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-copy)]">
          {items.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-copy)]">Información en preparación.</p>
      )}
    </div>
  );
}
