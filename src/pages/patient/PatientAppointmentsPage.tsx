import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyAppointments } from "../../services/appointmentService";
import {
  attachReservationPaymentReceipt,
  getMyReservations,
  getReservationReceiptUrl,
  uploadReservationPaymentReceipt,
} from "../../services/reservationService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { formatDate } from "../../utils/text";

export function PatientAppointmentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyAppointments>>>([]);
  const [reservations, setReservations] = useState<Awaited<ReturnType<typeof getMyReservations>>>([]);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  const paymentQrImage = settings?.payment_qr_image ?? settings?.appointment_qr_payment_image ?? null;

  const load = async () => {
    if (!user) return;
    const [nextItems, nextReservations, nextSettings] = await Promise.all([
      getMyAppointments(user.id),
      getMyReservations(user.id),
      getSiteSettings(),
    ]);
    setItems(nextItems);
    setReservations(nextReservations);
    setSettings(nextSettings);
  };

  useEffect(() => {
    if (!user) return;
    void load()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  const uploadReceipt = async (reservationId: string, file?: File | null) => {
    if (!file) return;
    setUploadingId(reservationId);
    setMessage("");
    try {
      const path = await uploadReservationPaymentReceipt(file, reservationId);
      await attachReservationPaymentReceipt(reservationId, path);
      await load();
      setMessage("Recibimos tu comprobante. Administracion debe revisarlo para confirmar tu cita.");
    } catch {
      setMessage("No pudimos subir tu comprobante.");
    } finally {
      setUploadingId("");
    }
  };

  const openReceipt = async (path?: string | null) => {
    const url = await getReservationReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingState label="Cargando tus citas..." />;
  if (error) return <ErrorState label="No pudimos cargar tus citas." />;
  if (items.length === 0 && reservations.length === 0) return <EmptyState label="Todavia no tienes citas registradas." />;

  return (
    <div className="grid gap-4">
      {message ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      {reservations.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Reserva inteligente</p>
              <h2 className="mt-2 text-lg font-semibold">{item.appointment_type}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getReservationStatusBadgeClass(item.status)}`}>
              {item.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
            {formatDate(item.appointment_date)} · {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
            <br />
            {item.city} {item.location ? `· ${item.location}` : ""}
            {item.doctor_profiles?.full_name ? ` · ${item.doctor_profiles.full_name}` : ""}
          </p>

          {item.status === "Pendiente" || item.status === "Rechazada" ? (
            <div className="mt-4 rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
              <p className="text-sm font-semibold">Confirma tu cita con el pago por QR</p>
              {paymentQrImage ? (
                <img src={paymentQrImage} alt="QR general de pagos" className="mt-3 h-48 w-48 rounded-[18px] object-cover" />
              ) : null}
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                {item.status === "Rechazada"
                  ? "Tu comprobante fue observado. Puedes volver a subir uno nuevo para retomar la validacion."
                  : item.payment_receipt_path
                    ? "Tu comprobante ya fue enviado. Estamos revisandolo para confirmar tu cita."
                    : `Sube tu comprobante antes del ${formatDate(item.payment_expires_at ?? item.created_at)} para evitar la cancelacion automatica.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {!item.payment_receipt_path || item.status === "Rechazada" ? (
                  <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    {uploadingId === item.id
                      ? "Subiendo..."
                      : item.status === "Rechazada"
                        ? "Volver a subir comprobante"
                        : "Subir comprobante"}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(event) => void uploadReceipt(item.id, event.target.files?.[0] ?? null)}
                      disabled={uploadingId === item.id}
                    />
                  </label>
                ) : null}
                {item.payment_receipt_path ? (
                  <button onClick={() => void openReceipt(item.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    Ver comprobante actual
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {item.status === "Confirmada" ? (
            <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Tu pago fue aprobado y la cita ya esta confirmada.
            </div>
          ) : null}

          {item.status === "Rechazada" ? (
            <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold">Tu comprobante fue rechazado.</p>
              <p className="mt-1">{item.admin_notes?.trim() || "Revisa el motivo y vuelve a subir un nuevo comprobante."}</p>
            </div>
          ) : null}

          {item.admin_notes ? (
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">Administracion: {item.admin_notes}</p>
          ) : null}
        </div>
      ))}

      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAppointmentStatusBadgeClass(item.status)}`}>
              {item.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
            {formatDate(item.appointment_date)} · {item.start_time}
            <br />
            {item.city} {item.location ? `· ${item.location}` : ""}
            {item.doctor_profiles?.full_name ? ` · ${item.doctor_profiles.full_name}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function getReservationStatusBadgeClass(status: string) {
  if (status === "Confirmada") return "bg-emerald-100 text-emerald-800";
  if (status === "Rechazada") return "bg-rose-100 text-rose-800";
  if (status === "Pendiente") return "bg-amber-100 text-amber-800";
  return "bg-[rgba(216,194,174,0.26)] text-[var(--color-mocha)]";
}

function getAppointmentStatusBadgeClass(status: string) {
  if (status === "Confirmada" || status === "Realizada") return "bg-emerald-100 text-emerald-800";
  if (status === "Cancelada") return "bg-rose-100 text-rose-800";
  return "bg-[rgba(216,194,174,0.26)] text-[var(--color-mocha)]";
}
