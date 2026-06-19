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

  const filteredTreatments = useMemo(
    () => treatments.filter((treatment) => city === "Todas" || treatment.city === city || !treatment.city),
    [city, treatments]
  );

  return (
    <section className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-14 sm:px-6 md:px-8 md:py-24">
      <Seo
        title="Tratamientos estéticos y medicina ortomolecular | Dra. Estefany Ballesteros"
        description="Explora tratamientos estéticos y protocolos de medicina ortomolecular con enfoque médico, información clara y opciones de reserva."
        path="/tratamientos"
        image="/doctora/dra2.jpg"
        keywords={["tratamientos estéticos", "medicina ortomolecular", "armonización facial", "tratamientos faciales Bolivia"]}
      />
      <PageIntro eyebrow="Tratamientos" title="Protocolos médicos personalizados para resultados naturales y seguros." />
      <div className="mt-8 w-full max-w-xs min-w-0">
        <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input">
          <option>Todas</option>
          {boliviaCities.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="mt-10 min-w-0 max-w-full sm:mt-12">
        {loading && (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        )}
        {error && <ErrorState />}
        {!loading && !error && filteredTreatments.length === 0 && <EmptyState />}
        {!loading && !error && filteredTreatments.length > 0 && (
          <div className="grid min-w-0 gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredTreatments.map((treatment, index) => (
              <AnimatedCard key={treatment.id} index={index}>
                <article className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)] transition-shadow duration-300 hover:shadow-[0_24px_62px_rgba(110,74,47,0.13)] sm:rounded-[28px]">
                  <ContentCover src={treatment.cover_image} alt={treatment.title} label="Tratamiento" wrapperClassName="h-56 w-full sm:h-64" />
                  <div className="min-w-0 p-5 sm:p-6">
                    <h2 className="break-words text-[1.55rem] font-semibold leading-tight sm:text-2xl">{treatment.title}</h2>
                    <DoctorByline doctor={treatment.doctor_profiles} />
                    <p className="mt-3 max-w-full break-words text-sm leading-7 text-[var(--color-copy)]">{treatment.short_description}</p>
                    <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Link to={`/tratamientos/${treatment.slug}`} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[var(--color-chocolate)]">
                        Ver detalles
                      </Link>
                      {treatment.requires_assessment ? (
                        <Link to={`/tratamientos/${treatment.slug}?accion=valoracion`} className="rounded-full border border-[var(--color-border)] px-5 py-3 text-center text-sm font-semibold transition hover:bg-white/80">
                          Reservar valoración
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setInterest(treatment)}
                        className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold transition hover:bg-white/80"
                      >
                        Pedir información
                      </button>
                    </div>
                  </div>
                </article>
              </AnimatedCard>
            ))}
          </div>
        )}
      </div>
      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType="Tratamiento"
        whatsappTemplate={interest?.whatsapp_prefill_message ?? null}
        contentCity={interest?.city ?? null}
        onClose={() => setInterest(null)}
      />
    </section>
  );
}

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="min-w-0 max-w-4xl">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)] sm:tracking-[0.28em]">{eyebrow}</p>
      <h1 className="font-display mt-4 max-w-full break-words text-5xl font-semibold leading-[0.95] md:text-7xl">{title}</h1>
      {text && <p className="mt-6 max-w-2xl break-words text-base leading-8 text-[var(--color-copy)]">{text}</p>}
    </div>
  );
}
