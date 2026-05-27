import { useEffect, useMemo, useState } from "react";

import { LockKeyhole, Save } from "lucide-react";

import { PublicImageUpload } from "../../components/admin/PublicImageUpload";
import { LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { canManageSite } from "../../lib/roles";
import {
  getPaymentQrAudit,
  getPaymentQrSecurityStatus,
  getSiteSettings,
  setPaymentQrPassword,
  updateGeneralPaymentQr,
  updateSiteSettings,
  type PaymentQrAuditRow,
  type PaymentQrSecurityStatus,
  type SiteSettingsRow,
} from "../../services/siteSettingsService";

export function SiteSettingsAdminPage() {
  const { role } = useAuth();
  const [values, setValues] = useState<Partial<SiteSettingsRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentQrDraft, setPaymentQrDraft] = useState("");
  const [qrPassword, setQrPassword] = useState("");
  const [qrReason, setQrReason] = useState("");
  const [savingQr, setSavingQr] = useState(false);
  const [qrMessage, setQrMessage] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [auditRows, setAuditRows] = useState<PaymentQrAuditRow[]>([]);
  const [qrSecurity, setQrSecurity] = useState<PaymentQrSecurityStatus>({ configured: false, available: false });

  const isSuperadmin = role === "superadmin";
  const isCreatingQrPassword = isSuperadmin && !qrSecurity.configured;

  const load = async () => {
    const [settings, audit, security] = await Promise.all([
      getSiteSettings(),
      isSuperadmin ? getPaymentQrAudit().catch(() => [] as PaymentQrAuditRow[]) : Promise.resolve([] as PaymentQrAuditRow[]),
      isSuperadmin ? getPaymentQrSecurityStatus().catch(() => ({ configured: false, available: false })) : Promise.resolve({ configured: false, available: false }),
    ]);
    setValues(settings);
    setPaymentQrDraft(settings.payment_qr_image ?? settings.course_qr_payment_image ?? settings.appointment_qr_payment_image ?? "");
    setAuditRows(audit);
    setQrSecurity(security);
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [isSuperadmin]);

  const setValue = (name: keyof SiteSettingsRow, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const generalValues = useMemo(() => {
    const {
      payment_qr_image,
      payment_qr_updated_at,
      payment_qr_updated_by_email,
      appointment_qr_payment_image,
      course_qr_payment_image,
      ...rest
    } = values;
    return rest;
  }, [values]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateSiteSettings(generalValues);
      setMessage("Configuracion general guardada.");
    } finally {
      setSaving(false);
    }
  };

  const savePaymentQr = async () => {
    if (!paymentQrDraft) {
      setQrMessage("Debes subir la imagen QR antes de guardar.");
      return;
    }

    if (!qrPassword.trim()) {
      setQrMessage("Debes escribir la clave del QR para confirmar el cambio.");
      return;
    }

    setSavingQr(true);
    setQrMessage("");
    try {
      const row = await updateGeneralPaymentQr({
        image: paymentQrDraft,
        password: qrPassword,
        reason: qrReason,
      });
      setValues(row);
      setPaymentQrDraft(row.payment_qr_image ?? "");
      setQrPassword("");
      setQrReason("");
      setQrMessage("QR general de pagos actualizado correctamente.");
      if (isSuperadmin) {
        setAuditRows(await getPaymentQrAudit().catch(() => [] as PaymentQrAuditRow[]));
      }
    } catch (error) {
      setQrMessage(error instanceof Error ? error.message : "No se pudo actualizar el QR general de pagos.");
    } finally {
      setSavingQr(false);
    }
  };

  const savePassword = async () => {
    if (!isCreatingQrPassword && !passwordForm.currentPassword.trim()) {
      setPasswordMessage("Debes escribir la clave actual para cambiarla.");
      return;
    }

    if (passwordForm.newPassword.trim().length < 6) {
      setPasswordMessage("La nueva clave debe tener al menos 6 caracteres.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("La confirmacion de la clave no coincide.");
      return;
    }

    setSavingPassword(true);
    setPasswordMessage("");
    try {
      await setPaymentQrPassword({
        currentPassword: isCreatingQrPassword ? undefined : passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setQrSecurity({ configured: true, available: true });
      setPasswordMessage(isCreatingQrPassword ? "La primera clave del QR fue creada correctamente." : "La clave del QR fue cambiada correctamente.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "No se pudo guardar la clave del QR.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <LoadingState label="Cargando configuracion..." />;

  if (!canManageSite(role)) {
    return (
      <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Acceso restringido</p>
        <h1 className="font-display mt-3 text-4xl font-semibold">Esta configuracion solo la puede gestionar administracion del sitio.</h1>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
          Configuracion
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">
          Datos publicos del consultorio
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
          Aqui gestionamos los datos generales del sitio y el QR general de pagos con control de clave y auditoria.
        </p>
      </div>

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Telefono">
            <input value={values.phone ?? ""} onChange={(event) => setValue("phone", event.target.value)} className="premium-input" />
          </Field>
          <Field label="WhatsApp principal">
            <input value={values.whatsapp ?? ""} onChange={(event) => setValue("whatsapp", event.target.value)} className="premium-input" placeholder="5917XXXXXXX" />
          </Field>
          <Field label="Boton flotante de WhatsApp">
            <label className="mt-1 inline-flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={Boolean(values.show_whatsapp_button)}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    show_whatsapp_button: event.target.checked,
                  }))
                }
              />
              Mostrar boton flotante en paginas publicas
            </label>
          </Field>
          <Field label="Correo">
            <input value={values.email ?? ""} onChange={(event) => setValue("email", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Ciudad">
            <select value={values.city ?? ""} onChange={(event) => setValue("city", event.target.value)} className="premium-input">
              <option value="">Selecciona ciudad</option>
              {boliviaCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instagram URL">
            <input value={values.instagram_url ?? ""} onChange={(event) => setValue("instagram_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="TikTok URL">
            <input value={values.tiktok_url ?? ""} onChange={(event) => setValue("tiktok_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Nombre de la valoracion">
            <input value={values.assessment_label ?? ""} onChange={(event) => setValue("assessment_label", event.target.value)} className="premium-input" placeholder="Valoracion estetica" />
          </Field>
          <Field label="Tipo de cita para valoracion">
            <input value={values.assessment_appointment_type ?? ""} onChange={(event) => setValue("assessment_appointment_type", event.target.value)} className="premium-input" placeholder="Valoracion estetica" />
          </Field>
          <Field label="Google Maps URL">
            <input value={values.maps_url ?? ""} onChange={(event) => setValue("maps_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Google Maps embed URL">
            <input value={values.maps_embed_url ?? ""} onChange={(event) => setValue("maps_embed_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Precio de la valoracion">
            <input
              type="number"
              min="0"
              step="0.01"
              value={String(values.assessment_price ?? 0)}
              onChange={(event) => setValues((current) => ({ ...current, assessment_price: Number(event.target.value) }))}
              className="premium-input"
            />
          </Field>
          <Field label="Horas minimas para reprogramar">
            <input
              type="number"
              min="0"
              step="1"
              value={String(values.reservation_reschedule_hours_before ?? 48)}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  reservation_reschedule_hours_before: Number(event.target.value),
                }))
              }
              className="premium-input"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Direccion">
              <textarea value={values.address ?? ""} onChange={(event) => setValue("address", event.target.value)} className="premium-input min-h-24" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Horarios">
              <textarea value={values.business_hours ?? ""} onChange={(event) => setValue("business_hours", event.target.value)} className="premium-input min-h-24" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Texto footer">
              <textarea value={values.footer_text ?? ""} onChange={(event) => setValue("footer_text", event.target.value)} className="premium-input min-h-24" />
            </Field>
          </div>
        </div>

        {message ? <StatusBox tone="success" className="mt-6" message={message} /> : null}
        <button disabled={saving} onClick={() => void save()} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar configuracion general"}
        </button>
      </section>

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">QR general de pagos</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">Una sola imagen para cursos, citas y cualquier pago futuro</h2>
          </div>
          {values.payment_qr_updated_at ? (
            <p className="text-sm leading-7 text-[var(--color-copy)]">
              Ultimo cambio: {new Date(values.payment_qr_updated_at).toLocaleString("es-BO")}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <div className="grid gap-4">
            <PublicImageUpload
              label="Imagen QR general"
              value={paymentQrDraft}
              folder="site-settings/general-payment-qr"
              helperText="Sube aqui la imagen QR general que se mostrara en cursos, citas y cualquier flujo de pago."
              aspectRatio={1}
              optimize={false}
              onChange={setPaymentQrDraft}
            />
            <Field label="Clave de confirmacion del QR">
              <input
                type="password"
                value={qrPassword}
                onChange={(event) => setQrPassword(event.target.value)}
                className="premium-input"
                placeholder="Escribe la clave para autorizar el cambio"
              />
            </Field>
            <Field label="Motivo del cambio">
              <textarea
                value={qrReason}
                onChange={(event) => setQrReason(event.target.value)}
                className="premium-input min-h-24"
                placeholder="Opcional: explica por que cambiaste el QR"
              />
            </Field>
            {qrMessage ? <StatusBox tone={qrMessage.includes("correctamente") ? "success" : "error"} message={qrMessage} /> : null}
            <button disabled={savingQr || !paymentQrDraft} onClick={() => void savePaymentQr()} className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              <LockKeyhole className="h-4 w-4" />
              {savingQr ? "Protegiendo cambio..." : "Guardar QR protegido"}
            </button>
          </div>

          <div className="rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5">
            <p className="text-sm font-semibold text-[var(--color-ink)]">Uso del QR</p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Este QR general se replica para cursos, citas y cualquier otro flujo de pago del sitio. Para cambiarlo se necesita la clave y se guarda auditoria de usuario, fecha y motivo.
            </p>
            {values.payment_qr_updated_by_email ? (
              <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                Ultimo responsable: <strong className="text-[var(--color-ink)]">{values.payment_qr_updated_by_email}</strong>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {isSuperadmin ? (
        <>
          <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Clave del QR</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              {isCreatingQrPassword ? "Ingresa por primera vez la clave de proteccion" : "Cambiar la clave de proteccion"}
            </h2>
            {!qrSecurity.available ? (
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                Cuando apliques la migracion nueva, esta seccion detectara la clave automaticamente.
              </p>
            ) : null}
            <div className={`mt-6 grid gap-4 ${isCreatingQrPassword ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
              {!isCreatingQrPassword ? (
                <Field label="Clave actual">
                  <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} className="premium-input" />
                </Field>
              ) : null}
              <Field label="Nueva clave">
                <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Confirmar nueva clave">
                <input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} className="premium-input" />
              </Field>
            </div>
            {passwordMessage ? <StatusBox tone={passwordMessage.includes("correctamente") ? "success" : "error"} className="mt-4" message={passwordMessage} /> : null}
            <button disabled={savingPassword} onClick={() => void savePassword()} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              <LockKeyhole className="h-4 w-4" />
              {savingPassword ? "Guardando clave..." : isCreatingQrPassword ? "Crear primera clave del QR" : "Cambiar clave del QR"}
            </button>
          </section>

          <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Auditoria</p>
            <h2 className="font-display mt-2 text-3xl font-semibold">Historial privado del QR general</h2>
            <div className="mt-6 grid gap-4">
              {auditRows.length === 0 ? (
                <p className="text-sm leading-7 text-[var(--color-copy)]">Todavia no hay cambios auditados para este QR.</p>
              ) : (
                auditRows.map((row) => (
                  <div key={row.id} className="rounded-[22px] bg-[rgba(247,242,236,0.72)] p-4">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">
                      {row.changed_by_name ?? row.changed_by_email ?? "Usuario sin nombre"}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-[var(--color-copy)]">
                      {new Date(row.changed_at).toLocaleString("es-BO")}
                    </p>
                    {row.change_reason ? (
                      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                        Motivo: {row.change_reason}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function StatusBox({
  message,
  tone,
  className = "",
}: {
  message: string;
  tone: "success" | "error";
  className?: string;
}) {
  return (
    <div className={`${className} rounded-[20px] px-4 py-3 text-sm font-semibold ${tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
      {message}
    </div>
  );
}
