import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { CheckCircle2, CreditCard, FileUp } from "lucide-react";

import { LoadingState, ErrorState } from "../../components/common/AsyncState";
import {
  getManualReservationPaymentByToken,
  submitManualReservationPaymentByToken,
  uploadManualReservationReceipt,
  type ManualReservationPaymentPageRow,
} from "../../services/reservationService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { formatDate, formatMoney } from "../../utils/text";

export function PublicManualReservationPaymentPage() {
  const { token = "" } = useParams();
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [reservation, setReservation] = useState<ManualReservationPaymentPageRow | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([getSiteSettings(), getManualReservationPaymentByToken(token)])
      .then(([siteSettings, row]) => {
        setSettings(siteSettings);
        setReservation(row);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No pudimos abrir este enlace de pago."))
      .finally(() => setLoading(false));
  }, [token]);

  const paymentQrImage = settings?.payment_qr_image ?? settings?.appointment_qr_payment_image ?? null;
  const expiresText = useMemo(() => {
    if (!reservation?.payment_expires_at) return null;
    return formatDate(reservation.payment_expires_at);
  }, [reservation?.payment_expires_at]);

  const submit = async () => {
    if (!receiptFile) {
      setError("Debes subir el comprobante para confirmar tu pago.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const path = await uploadManualReservationReceipt(receiptFile, token);
      const updated = await submitManualReservationPaymentByToken(token, path);
      setReservation((current) =>
        current
          ? { ...current, payment_receipt_path: updated.payment_receipt_path ?? path }
          : current
      );
      setSuccess("Recibimos tu comprobante. Revisaremos el pago y te confirmaremos la cita por WhatsApp.");
      setReceiptFile(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos registrar tu comprobante.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Cargando enlace de pago..." />;
  }

  if (error && !reservation) {
    return <ErrorState label={error} />;
  }

  if (!reservation) {
    return <ErrorState label="No encontramos una cita manual pendiente asociada a este enlace." />;
  }

  if (success) {
    return (
      <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4">
        <div className="relative w-full rounded-[32px] border border-[rgba(189,152,119,0.28)] bg-[rgba(255,249,244,0.96)] px-8 py-10 text-center shadow-[0_24px_70px_rgba(62,42,31,0.12)]">
          <div className="absolute inset-0 rounded-[32px] bg-[rgba(189,152,119,0.08)] blur-3xl" />
          <div className="relative">
            <img
              src="/doctora/logodra.svg"
              alt="Logo Dra. Estefany"
              className="mx-auto h-20 w-20 animate-[pulse_2.2s_ease-in-out_infinite] object-contain"
            />
            <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(111,122,96,0.14)] text-[rgb(78,107,84)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Comprobante recibido
            </p>
            <h1 className="font-display mt-3 text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Muchas gracias por confiar en nosotros
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] sm:text-base">
              {success}
            </p>
            <p className="mt-5 text-xs leading-6 text-[var(--color-copy)]">
              Si todo esta correcto, te confirmaremos la cita por WhatsApp en cuanto el equipo revise el pago.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl rounded-[32px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_24px_80px_rgba(62,42,31,0.08)] sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Pago de cita manual
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">
            Confirma tu reserva
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Esta pagina no necesita registro. Revisa los datos de tu cita, paga con el QR configurado y sube tu comprobante para que el equipo confirme por WhatsApp.
          </p>
        </div>
        <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
            Monto
          </p>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {formatMoney(reservation.payment_amount ?? 0)}
          </p>
        </div>
      </div>

      {success ? (
        <div className="mt-6 rounded-[24px] border border-[rgba(111,122,96,0.24)] bg-[rgba(111,122,96,0.12)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          {success}
        </div>
      ) : null}
      {error && reservation ? (
        <div className="mt-6 rounded-[24px] border border-[rgba(154,107,67,0.2)] bg-[rgba(154,107,67,0.08)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.92)] p-5">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Resumen de la cita</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-copy)]">
            <p><strong className="text-[var(--color-ink)]">Paciente:</strong> {reservation.patient_name ?? "Paciente"}</p>
            <p><strong className="text-[var(--color-ink)]">CI:</strong> {reservation.patient_document_number ?? "Sin carnet"}</p>
            <p><strong className="text-[var(--color-ink)]">Tipo:</strong> {reservation.appointment_title ?? reservation.appointment_type}</p>
            <p><strong className="text-[var(--color-ink)]">Horario:</strong> {formatDate(reservation.appointment_date)} · {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}</p>
            <p><strong className="text-[var(--color-ink)]">Lugar:</strong> {reservation.location ?? reservation.patient_city ?? "Por confirmar"}</p>
            <p><strong className="text-[var(--color-ink)]">Doctora:</strong> {reservation.doctor_name ?? "Equipo medico"}</p>
            <p><strong className="text-[var(--color-ink)]">Estado:</strong> {reservation.status}</p>
            {expiresText ? (
              <p>
                <strong className="text-[var(--color-ink)]">Vence:</strong> {expiresText}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.92)] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
            <CreditCard className="h-4 w-4" />
            Pago y comprobante
          </div>
          {paymentQrImage ? (
            <div className="mt-5 rounded-[24px] bg-white/72 p-4">
              <img
                src={paymentQrImage}
                alt="QR para pagar cita"
                className="mx-auto h-56 w-56 rounded-[22px] object-contain"
              />
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
              Aun no hay un QR configurado para citas. Contacta al consultorio para recibir ayuda.
            </p>
          )}

          <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
            Para confirmar tu cita o reserva debes completar el pago dentro del tiempo indicado en tu mensaje y subir el comprobante aqui mismo.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/82 px-5 py-3 text-sm font-semibold text-[var(--color-ink)]">
              <FileUp className="h-4 w-4" />
              {receiptFile ? "Cambiar comprobante" : "Subir comprobante"}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                disabled={submitting}
              />
            </label>
          </div>

          {receiptFile ? (
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Archivo listo: <strong className="text-[var(--color-ink)]">{receiptFile.name}</strong>
            </p>
          ) : reservation.payment_receipt_path ? (
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Ya tenemos un comprobante cargado para esta cita. Si necesitas cambiarlo, puedes volver a subirlo antes de que el equipo lo revise.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!receiptFile || submitting || !paymentQrImage}
            className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Enviando comprobante..." : "Enviar comprobante"}
          </button>
        </div>
      </div>
    </section>
  );
}
