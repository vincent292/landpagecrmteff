import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getPatientByProfileId } from "../../services/patientService";
import { getPatientPhotos, getPhotoComparisons } from "../../services/patientPhotoService";

export function PatientTreatmentsPage() {
  const { user } = useAuth();
  const [comparisons, setComparisons] = useState<Awaited<ReturnType<typeof getPhotoComparisons>>>([]);
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof getPatientPhotos>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    getPatientByProfileId(user.id)
      .then(async (patient) => {
        if (!patient) {
          setComparisons([]);
          setPhotos([]);
          return;
        }
        const [nextComparisons, nextPhotos] = await Promise.all([
          getPhotoComparisons(patient.id),
          getPatientPhotos(patient.id),
        ]);
        setComparisons(nextComparisons.filter((item) => item.is_visible_to_patient));
        setPhotos(nextPhotos.filter((item) => item.is_visible_to_patient));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Cargando tu seguimiento..." />;
  if (error) return <ErrorState label="No pudimos cargar esta seccion." />;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Evolucion y fotos visibles</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          Solo aparecen aqui los materiales marcados como visibles para ti.
        </p>
      </section>

      {comparisons.length === 0 && photos.length === 0 ? (
        <EmptyState label="Aun no hay seguimiento visual visible para tu cuenta." />
      ) : null}

      {comparisons.length > 0 ? (
        <section className="grid gap-5 lg:grid-cols-2">
          {comparisons.map((item) => (
            <div key={item.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{item.treatment_name}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PhotoBox label="Antes" src={item.before_photo?.signed_url} />
                <PhotoBox label="Despues" src={item.after_photo?.signed_url} />
              </div>
              {item.notes ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.notes}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-4">
              <PhotoBox label={item.treatment_name ?? item.photo_type} src={item.signed_url} />
              <p className="mt-3 text-sm font-semibold">{item.treatment_name ?? item.photo_type}</p>
              {item.notes ? <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{item.notes}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PhotoBox({ label, src }: { label: string; src?: string | null }) {
  if (!src) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.7)] text-sm font-semibold text-[var(--color-copy)]">
        Imagen no disponible
      </div>
    );
  }

  return <img src={src} alt={label} className="h-56 w-full rounded-[22px] object-cover" />;
}
