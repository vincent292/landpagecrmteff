import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { ContentCover } from "../../components/ui/ContentCover";
import { useAuth } from "../../hooks/useAuth";
import {
  attachCourseEnrollmentPaymentReceipt,
  getCourseEnrollmentReceiptUrl,
  getMyCourseEnrollments,
  uploadCourseEnrollmentPaymentReceipt,
} from "../../services/enrollmentService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { formatDate, formatMoney } from "../../utils/text";

export function PatientCoursesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyCourseEnrollments>>>([]);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  const paymentQrImage = settings?.payment_qr_image ?? settings?.course_qr_payment_image ?? null;

  const load = async () => {
    if (!user) return;
    const [nextItems, nextSettings] = await Promise.all([
      getMyCourseEnrollments(user.id),
      getSiteSettings(),
    ]);
    setItems(nextItems);
    setSettings(nextSettings);
  };

  useEffect(() => {
    if (!user) return;
    void load()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  const uploadReceipt = async (enrollmentId: string, file?: File | null) => {
    if (!file) return;
    setUploadingId(enrollmentId);
    setMessage("");
    try {
      const path = await uploadCourseEnrollmentPaymentReceipt(file, enrollmentId);
      await attachCourseEnrollmentPaymentReceipt(enrollmentId, path);
      await load();
      setMessage("Recibimos tu comprobante. Administracion debe revisarlo para confirmar tu cupo.");
    } catch {
      setMessage("No pudimos subir tu comprobante.");
    } finally {
      setUploadingId("");
    }
  };

  const openReceipt = async (path?: string | null) => {
    const url = await getCourseEnrollmentReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingState label="Cargando tus cursos..." />;
  if (error) return <ErrorState label="No pudimos cargar tus inscripciones." />;
  if (items.length === 0) return <EmptyState label="Todavia no tienes inscripciones a cursos." />;

  return (
    <div className="grid gap-4">
      {message ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      {items.map((item) => {
        const canUpload = !item.payment_receipt_path || item.status === "Rechazado";

        return (
          <div key={item.id} className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white/75">
            <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
              <ContentCover
                src={item.courses?.cover_image}
                alt={item.courses?.title ?? "Curso"}
                label="Curso"
                wrapperClassName="h-full min-h-56 w-full"
              />
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{item.courses?.title ?? "Curso"}</h2>
                  <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                    {item.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  {item.courses?.start_date ? formatDate(item.courses.start_date) : "Fecha por confirmar"}
                  {item.courses?.start_time ? ` · ${item.courses.start_time}` : ""}
                  <br />
                  {item.courses?.city ?? "Ciudad por confirmar"} {item.courses?.modality ? `· ${item.courses.modality}` : ""}
                  {item.courses?.price != null ? ` · ${formatMoney(item.courses.price)}` : ""}
                </p>

                <div className="mt-4 rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4">
                  <p className="text-sm font-semibold">Pago e inscripcion</p>
                  {paymentQrImage ? (
                    <img src={paymentQrImage} alt="QR general de pagos" className="mt-3 h-40 w-40 rounded-[18px] object-cover" />
                  ) : null}
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                    {item.payment_receipt_path
                      ? "Tu comprobante ya fue enviado. Estamos revisandolo para confirmar tu inscripcion."
                      : "Sube tu comprobante para que administracion confirme tu cupo."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {canUpload ? (
                      <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                        {uploadingId === item.id ? "Subiendo..." : item.payment_receipt_path ? "Volver a subir comprobante" : "Subir comprobante"}
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
                        Ver comprobante
                      </button>
                    ) : null}
                  </div>
                  {item.admin_notes ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">Administracion: {item.admin_notes}</p> : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
