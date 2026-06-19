import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Link, Navigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { ContentCover } from "../../components/ui/ContentCover";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import {
  attachCourseEnrollmentPaymentReceipt,
  getCourseEnrollmentReceiptUrl,
  getMyCourseEnrollmentForCourse,
  saveCourseEnrollment,
  type EnrollmentRow,
  uploadCourseEnrollmentPaymentReceipt,
} from "../../services/enrollmentService";
import { updateMyProfile } from "../../services/profileService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { getCourseBySlug, type CourseRow } from "../../services/courseService";
import { formatDate, formatMoney, listFromText } from "../../utils/text";

type FlashMessage = {
  tone: "success" | "error";
  text: string;
};

export function CourseDetailPage() {
  const { slug } = useParams();
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentRow | null>(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    profession: "",
    document_number: "",
  });

  useEffect(() => {
    if (!slug) return;
    getCourseBySlug(slug)
      .then(setCourse)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    getSiteSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!course || !user) return;
    getMyCourseEnrollmentForCourse(user.id, course.id)
      .then(setEnrollment)
      .catch(() => undefined);
  }, [course, user]);

  useEffect(() => {
    if (!user && !profile && !enrollment) return;
    setForm({
      full_name: enrollment?.full_name ?? profile?.full_name ?? user?.user_metadata.full_name ?? "",
      email: enrollment?.email ?? profile?.email ?? user?.email ?? "",
      phone: enrollment?.phone ?? profile?.phone ?? user?.user_metadata.phone ?? "",
      city: enrollment?.city ?? profile?.city ?? user?.user_metadata.city ?? "",
      profession: enrollment?.profession ?? "",
      document_number:
        enrollment?.document_number ??
        profile?.document_number ??
        user?.user_metadata.document_number ??
        "",
    });
  }, [enrollment, profile, user]);

  useEffect(() => {
    if (!showEnrollmentModal && !showAuthPrompt) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAuthPrompt, showEnrollmentModal]);

  if (!slug) return <Navigate to="/academy" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!course) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este programa de Academy." /></section>;

  const detailPath = `/academy/${course.slug}`;
  const paymentQrImage = settings?.payment_qr_image ?? settings?.course_qr_payment_image ?? null;
  const canSubmitEnrollment =
    form.full_name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.document_number.trim().length > 0;
  const alreadySubmittedEnrollment = Boolean(enrollment?.payment_receipt_path);

  const requiresNewReceipt = !enrollment?.payment_receipt_path || enrollment?.status === "Rechazado";
  const canSubmitPayment =
    canSubmitEnrollment &&
    Boolean(paymentQrImage) &&
    (!requiresNewReceipt || Boolean(receiptFile));

  const setFlashMessage = (tone: FlashMessage["tone"], text: string) => {
    setMessage({ tone, text });
  };

  const refreshEnrollment = async () => {
    if (!user) return;
    const nextEnrollment = await getMyCourseEnrollmentForCourse(user.id, course.id);
    setEnrollment(nextEnrollment);
  };

  const submitEnrollmentPayment = async () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    if (!canSubmitEnrollment) {
      setFlashMessage("error", "Completa nombre, correo, celular, ciudad y numero de carnet antes de continuar.");
      return;
    }

    if (!paymentQrImage) {
      setFlashMessage("error", "Aun no configuramos el QR de pago para Academy.");
      return;
    }

    if (requiresNewReceipt && !receiptFile) {
      setFlashMessage("error", "Debes subir el comprobante bancario antes de enviar tu inscripcion.");
      return;
    }

    setSavingEnrollment(true);
    setMessage(null);
    try {
      if (profile?.id) {
        await updateMyProfile(profile.id, {
          full_name: form.full_name,
          phone: form.phone,
          city: form.city,
          document_number: form.document_number,
        });
        await refreshProfile();
      }

      const nextEnrollment = await saveCourseEnrollment({
        course_id: course.id,
        user_id: user.id,
        full_name: form.full_name,
        document_number: form.document_number,
        phone: form.phone,
        email: form.email,
        city: form.city,
        profession: form.profession,
      });
      setEnrollment(nextEnrollment);

      if (receiptFile) {
        const path = await uploadCourseEnrollmentPaymentReceipt(receiptFile, nextEnrollment.id);
        await attachCourseEnrollmentPaymentReceipt(nextEnrollment.id, path);
      }

      await refreshEnrollment();
      setReceiptFile(null);
      setFlashMessage("success", "Tu inscripcion a Academy fue enviada con el comprobante. El equipo revisara el pago para aprobarla o rechazarla.");
    } catch (saveError) {
      console.error("Error guardando inscripcion al curso", {
        courseId: course.id,
        userId: user.id,
        saveError,
      });
      const detail = saveError instanceof Error ? saveError.message : "";
      setFlashMessage(
        "error",
        detail
          ? `No pudimos guardar tu solicitud de inscripcion. ${detail}`
          : "No pudimos guardar tu solicitud de inscripcion."
      );
    } finally {
      setSavingEnrollment(false);
    }
  };

  const openReceipt = async () => {
    const url = await getCourseEnrollmentReceiptUrl(enrollment?.payment_receipt_path ?? null);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenEnrollment = () => {
    setMessage(null);
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    if (alreadySubmittedEnrollment) {
      return;
    }
    setShowEnrollmentModal(true);
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 pb-32 md:px-8 md:py-20 md:pb-20">
      <div className="grid gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-center">
        <div className="overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-white/60 p-3 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
          <ContentCover
            src={course.cover_image}
            alt={course.title}
            label="Academy"
            wrapperClassName="aspect-[4/3] w-full rounded-[24px] md:aspect-[16/11]"
          />
        </div>
        <div className="rounded-[32px] border border-[var(--color-border)] bg-white/72 p-6 shadow-[0_18px_48px_rgba(110,74,47,0.08)] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Academy</p>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-6xl">{course.title}</h1>
          <DoctorByline doctor={course.doctor_profiles} />
          <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{course.description}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <Block title="Temario" items={listFromText(course.syllabus)} />
          <Block title="Requisitos" items={listFromText(course.requirements)} />
          <Block title="Certificacion" items={listFromText(course.certification)} />
        </div>
        <aside className="h-fit rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
          <p className="text-sm text-[var(--color-copy)]">{course.city} - {course.modality}</p>
          <h2 className="mt-3 text-3xl font-semibold">{formatMoney(course.price)}</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            {course.start_date ? formatDate(course.start_date) : "Fecha por confirmar"} - {course.start_time ?? "Hora por confirmar"}
            <br />
            {course.available_slots ?? 0} cupos disponibles
          </p>
          <button
            onClick={handleOpenEnrollment}
            disabled={alreadySubmittedEnrollment}
            className="mt-6 w-full rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white"
          >
            {alreadySubmittedEnrollment ? "Ya te inscribiste" : "Quiero inscribirme"}
          </button>
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-[var(--color-border)] px-6 py-3.5 text-sm font-semibold"
          >
            Pedir información
          </button>
          {course.public_info ? (
            <div className="mt-4 rounded-[20px] bg-[rgba(247,242,236,0.82)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              {course.public_info}
            </div>
          ) : null}
          {!user ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Para inscribirte en Academy te pediremos iniciar sesión o crear tu cuenta.
            </p>
          ) : null}
          {enrollment ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Estado actual: <strong className="text-[var(--color-ink)]">{enrollment.status}</strong>
            </p>
          ) : null}
        </aside>
      </div>

      {!showEnrollmentModal && !showAuthPrompt ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.94)] px-4 py-3 shadow-[0_-18px_48px_rgba(62,42,31,0.10)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{course.title}</p>
              <p className="text-xs text-[var(--color-copy)]">{formatMoney(course.price)} - {course.available_slots ?? 0} cupos</p>
            </div>
            <button
              onClick={handleOpenEnrollment}
              disabled={alreadySubmittedEnrollment}
              className="shrink-0 rounded-full bg-[var(--color-caramel)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {alreadySubmittedEnrollment ? "Ya te inscribiste" : "Quiero inscribirme"}
            </button>
          </div>
        </div>
      ) : null}

      {showAuthPrompt ? createPortal(
        <ModalShell onClose={() => setShowAuthPrompt(false)} maxWidthClassName="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Acceso requerido</p>
          <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">Para inscribirte primero debes acceder a tu cuenta</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Si ya revisaste este programa de Academy y quieres avanzar, entra con tu cuenta o registrate para continuar con el pago y subir tu comprobante.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              state={{ from: detailPath }}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              state={{ from: detailPath }}
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
            >
              Crear cuenta
            </Link>
          </div>
        </ModalShell>,
        document.body
      ) : null}

      {showEnrollmentModal ? createPortal(
        <ModalShell onClose={() => setShowEnrollmentModal(false)} maxWidthClassName="max-w-5xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Academy</p>
              <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">Confirma tus datos, paga y completa tu inscripcion</h2>
            </div>
            {enrollment?.status ? (
              <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
                {enrollment.status}
              </span>
            ) : null}
          </div>

          {message ? (
            <div className={`mt-5 rounded-[20px] px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
              {message.text}
            </div>
          ) : null}

          <div className="mt-8 grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 rounded-[24px] bg-[rgba(247,242,236,0.82)] p-4 text-sm leading-7 text-[var(--color-copy)]">
                Paso 1: confirma tus datos. El numero de carnet tambien se guarda en tu perfil para no volver a pedirlo luego.
              </div>
              <Field label="Nombre completo">
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment} />
              </Field>
              <Field label="Correo">
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment} />
              </Field>
              <Field label="Celular">
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment} />
              </Field>
              <Field label="Ciudad">
                <select value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment}>
                  <option value="">Selecciona ciudad</option>
                  {boliviaCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Numero de carnet">
                <input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment} />
              </Field>
              <Field label="Profesion">
                <input value={form.profession} onChange={(event) => setForm((current) => ({ ...current, profession: event.target.value }))} className="premium-input" disabled={alreadySubmittedEnrollment} />
              </Field>
            </div>

            <div className="rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">Paso 2: realiza el pago por QR</p>
              {paymentQrImage ? (
                <>
                  <img src={paymentQrImage} alt="QR general de pagos" className="mt-4 h-56 w-56 rounded-[20px] object-contain" />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a href={paymentQrImage} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                      Ver o descargar QR
                    </a>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Aun no configuramos el QR de pago para Academy. El admin puede subirlo desde Panel / Configuracion.
                </p>
              )}
              <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                El comprobante se conserva temporalmente y por ahora se limpia después de 7 días.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {requiresNewReceipt && !alreadySubmittedEnrollment ? (
                  <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    {receiptFile ? "Cambiar comprobante" : enrollment?.payment_receipt_path ? "Volver a subir comprobante" : "Subir comprobante"}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                      disabled={savingEnrollment}
                    />
                  </label>
                ) : null}
                {enrollment?.payment_receipt_path ? (
                  <button onClick={() => void openReceipt()} className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    Ver comprobante
                  </button>
                ) : null}
              </div>
              {receiptFile ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Comprobante listo para enviar: <strong className="text-[var(--color-ink)]">{receiptFile.name}</strong>
                </p>
              ) : null}
              {alreadySubmittedEnrollment ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Tu formulario ya fue enviado con comprobante. Ya no puedes editar esta inscripcion.
                </p>
              ) : requiresNewReceipt ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Debes subir el comprobante bancario para que se envie la inscripcion.
                </p>
              ) : null}
              {enrollment?.admin_notes ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">Administracion: {enrollment.admin_notes}</p>
              ) : null}
              {!alreadySubmittedEnrollment ? (
                <div className="mt-6">
                  <button
                    onClick={() => void submitEnrollmentPayment()}
                    disabled={!canSubmitPayment || savingEnrollment}
                    className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingEnrollment ? "Enviando..." : "Pagar mi inscripcion"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </ModalShell>,
        document.body
      ) : null}
      <InfoRequestModal
        open={showInfoModal}
        interest={course.title}
        interestId={course.id}
        interestType="Curso"
        whatsappTemplate={course.whatsapp_prefill_message ?? null}
        contentPrice={course.price ?? null}
        contentCity={course.city ?? null}
        onClose={() => setShowInfoModal(false)}
      />
    </section>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-copy)]">
          {items.map((item) => <li key={item}>- {item}</li>)}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-copy)]">Información en preparación.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({
  children,
  maxWidthClassName = "max-w-4xl",
  onClose,
}: {
  children: ReactNode;
  maxWidthClassName?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(43,33,27,0.44)] p-4 backdrop-blur-sm">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8 ${maxWidthClassName}`}>
        <div className="mb-6 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
