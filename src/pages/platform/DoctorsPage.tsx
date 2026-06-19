import { useEffect, useState } from "react";

import { Mail, MessageCircleMore } from "lucide-react";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { Seo } from "../../components/common/Seo";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { getDoctors, type DoctorProfileRow } from "../../services/doctorService";
import { PageIntro } from "./TreatmentsPage";

export function DoctorsPage() {
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoctors()
      .then(setDoctors)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <Seo
        title="Doctoras de medicina estética en Bolivia | Dra. Estefany Ballesteros"
        description="Conoce al equipo médico y las doctoras vinculadas al proyecto de Dra. Estefany Ballesteros para atención y seguimiento en Bolivia."
        path="/doctoras"
        image="/doctora/dra1.jpg"
        keywords={["doctoras medicina estética Bolivia", "equipo médico estética Bolivia", "Dra. Estefany Ballesteros doctoras"]}
      />
      <PageIntro
        eyebrow="Doctoras"
        title="Un equipo médico preparado para acompañar tu proceso con criterio y cercanía."
        text="Cada doctora puede tener su agenda, pacientes asignados y canales de contacto sin mezclar información clínica."
      />

      <div className="mt-12">
        {loading && <LoadingState label="Cargando doctoras..." />}
        {!loading && doctors.length === 0 && <EmptyState label="Todavía no hay doctoras publicadas." />}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/65 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
              <ImageWithSkeleton
                src={doctor.photo_url ?? "/doctora/dra1.jpg"}
                fallbackSrc="/doctora/dra1.jpg"
                alt={doctor.full_name}
                wrapperClassName="h-72 w-full"
              />
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                  {doctor.specialty ?? "Medicina estética"} · {doctor.city ?? "Bolivia"}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">{doctor.full_name}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{doctor.bio}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {doctor.whatsapp && (
                    <a href={`https://wa.me/${doctor.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white">
                      <MessageCircleMore className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                  {doctor.email && (
                    <a href={`mailto:${doctor.email}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
                      <Mail className="h-4 w-4" />
                      Correo
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
