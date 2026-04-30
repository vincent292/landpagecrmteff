import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { boliviaCities } from "../../data/cities";
import { getTreatments, type TreatmentRow } from "../../services/treatmentService";

export function TreatmentsPage() {
  const [interest, setInterest] = useState<TreatmentRow | null>(null);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
  const [city, setCity] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getTreatments()
      .then(setTreatments)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredTreatments = useMemo(() => treatments.filter((treatment) => city === "Todas" || treatment.city === city || !treatment.city), [city, treatments]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Tratamientos" title="Protocolos médicos diseñados para una belleza natural, elegante y segura." />
      <div className="mt-8 max-w-xs"><select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input"><option>Todas</option>{boliviaCities.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mt-12">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && filteredTreatments.length === 0 && <EmptyState />}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredTreatments.map((treatment) => (
            <article key={treatment.id} className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
              <img src={treatment.cover_image ?? "/doctora/dra2.jpg"} alt={treatment.title} className="h-64 w-full object-cover" />
              <div className="p-6">
                <h2 className="text-2xl font-semibold">{treatment.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{treatment.short_description}</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link to={`/tratamientos/${treatment.slug}`} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-center text-sm font-semibold text-white">
                    Ver detalles
                  </Link>
                  <button type="button" onClick={() => setInterest(treatment)} className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
                    Necesito más información
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType="Tratamiento"
        onClose={() => setInterest(null)}
      />
    </section>
  );
}

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{eyebrow}</p>
      <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.95] md:text-7xl">{title}</h1>
      {text && <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-copy)]">{text}</p>}
    </div>
  );
}



