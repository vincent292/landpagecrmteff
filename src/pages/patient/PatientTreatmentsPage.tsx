import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getPatientByProfileId } from "../../services/patientService";
import { getPatientPhotos, getPhotoComparisons } from "../../services/patientPhotoService";
import {
  getMyTreatmentOrders,
  getTreatmentOrderPreferredSlot,
  getTreatmentOrderReceiptUrl,
  type TreatmentOrderRow,
} from "../../services/treatmentOrderService";
import { formatDate, formatMoney } from "../../utils/text";

export function PatientTreatmentsPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<TreatmentOrderRow[]>([]);
  const [comparisons, setComparisons] = useState<Awaited<ReturnType<typeof getPhotoComparisons>>>([]);
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof getPatientPhotos>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getMyTreatmentOrders(user.id),
      getPatientByProfileId(user.id),
    ])
      .then(async ([nextOrders, patient]) => {
        setOrders(nextOrders);
        return patient;
      })
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

  const openReceipt = async (path?: string | null) => {
    const url = await getTreatmentOrderReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

      {orders.length === 0 && comparisons.length === 0 && photos.length === 0 ? (
        <EmptyState label="Aún no hay seguimiento visual visible para tu cuenta." />
      ) : null}

      {orders.length > 0 ? (
        <section className="grid gap-4">
          {orders.map((order) => {
            const preferredSlot = getTreatmentOrderPreferredSlot(order);

            return (
              <div key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                      Tratamiento solicitado
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{order.treatments?.title ?? "Tratamiento"}</h2>
                  </div>
                  <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                    {order.status}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  Total {formatMoney(order.total_amount)} - Pagaste {formatMoney(order.amount_paid ?? 0)} - Pendiente {formatMoney(order.amount_pending ?? order.total_amount)}
                  <br />
                  Modalidad: {order.payment_mode === "anticipo" ? `Anticipo ${order.payment_percent}%` : "Pago completo"}
                  <br />
                  Creado {formatDate(order.created_at)} {order.treatments?.city ? `- ${order.treatments.city}` : ""}
                </p>

                {preferredSlot ? (
                  <p className="mt-3 rounded-[18px] bg-[rgba(247,242,236,0.78)] px-4 py-3 text-sm leading-7 text-[var(--color-copy)]">
                    {formatDate(preferredSlot.date)} - {preferredSlot.start_time?.slice(0, 5)} - {preferredSlot.end_time?.slice(0, 5)}
                    <br />
                    {preferredSlot.city ?? order.city ?? "Sin ciudad"} - {preferredSlot.appointment_reservation_id ? "Horario confirmado" : "Pendiente de confirmacion"}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  {order.payment_receipt_path ? (
                    <button onClick={() => void openReceipt(order.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Ver comprobante
                    </button>
                  ) : null}
                  {order.treatments?.slug ? (
                    <Link to={`/tratamientos/${order.treatments.slug}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Ver tratamiento
                    </Link>
                  ) : null}
                </div>

                {order.admin_notes ? (
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                    Administracion: {order.admin_notes}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
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
