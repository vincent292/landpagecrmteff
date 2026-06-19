import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ArrowDown,
  ArrowUp,
  Building2,
  History,
  LockKeyhole,
  MessageCircleMore,
  Pencil,
  Plus,
  QrCode,
  Save,
  Shield,
  Trash2,
  X,
} from "lucide-react";

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
  type CommunityChatOption,
  type PaymentQrAuditRow,
  type PaymentQrSecurityStatus,
  type SiteSettingsRow,
} from "../../services/siteSettingsService";

type MainTab = "public" | "community" | "qr";
type QrTab = "payment_qr" | "password" | "history";

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
  const [qrSecurity, setQrSecurity] = useState<PaymentQrSecurityStatus>({
    configured: false,
    available: false,
  });
  const [activeTab, setActiveTab] = useState<MainTab>("public");
  const [activeQrTab, setActiveQrTab] = useState<QrTab>("payment_qr");
  const [communityModal, setCommunityModal] = useState<{
    mode: "create" | "edit";
    option: CommunityChatOption;
  } | null>(null);

  const isSuperadmin = role === "superadmin";
  const isCreatingQrPassword = isSuperadmin && !qrSecurity.configured;

  const mainTabs: Array<{ id: MainTab; label: string; icon: ReactNode; description: string }> = [
    {
      id: "public",
      label: "Datos publicos",
      icon: <Building2 className="h-4 w-4" />,
      description: "Contacto, visibilidad y datos base del sitio.",
    },
    {
      id: "community",
      label: "Chat guiado",
      icon: <MessageCircleMore className="h-4 w-4" />,
      description: "Comunidades, respuestas y fallback del widget.",
    },
    {
      id: "qr",
      label: "QR y seguridad",
      icon: <Shield className="h-4 w-4" />,
      description: "Pagos, clave protegida e historial del QR.",
    },
  ];

  const qrTabs: Array<{ id: QrTab; label: string; icon: ReactNode }> = isSuperadmin
    ? [
        { id: "payment_qr", label: "QR general", icon: <QrCode className="h-4 w-4" /> },
        { id: "password", label: "Clave QR", icon: <LockKeyhole className="h-4 w-4" /> },
        { id: "history", label: "Historial", icon: <History className="h-4 w-4" /> },
      ]
    : [{ id: "payment_qr", label: "QR general", icon: <QrCode className="h-4 w-4" /> }];

  const load = async () => {
    const [settings, audit, security] = await Promise.all([
      getSiteSettings(),
      isSuperadmin
        ? getPaymentQrAudit().catch(() => [] as PaymentQrAuditRow[])
        : Promise.resolve([] as PaymentQrAuditRow[]),
      isSuperadmin
        ? getPaymentQrSecurityStatus().catch(() => ({ configured: false, available: false }))
        : Promise.resolve({ configured: false, available: false }),
    ]);

    setValues(settings);
    setPaymentQrDraft(
      settings.payment_qr_image ??
        settings.course_qr_payment_image ??
        settings.appointment_qr_payment_image ??
        ""
    );
    setAuditRows(audit);
    setQrSecurity(security);
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin && activeQrTab !== "payment_qr") {
      setActiveQrTab("payment_qr");
    }
  }, [activeQrTab, isSuperadmin]);

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

  const communityOptions = values.community_chat_options ?? [];
  const activeCommunityOptions = communityOptions.filter((option) => option.is_active);

  const save = async (successMessage: string) => {
    setSaving(true);
    setMessage("");
    try {
      const row = await updateSiteSettings(generalValues);
      setValues(row);
      setMessage(successMessage);
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
      setQrMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el QR general de pagos."
      );
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
      setPasswordMessage(
        isCreatingQrPassword
          ? "La primera clave del QR fue creada correctamente."
          : "La clave del QR fue cambiada correctamente."
      );
    } catch (error) {
      setPasswordMessage(
        error instanceof Error ? error.message : "No se pudo guardar la clave del QR."
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const moveCommunityOption = (id: string, direction: -1 | 1) => {
    setValues((current) => {
      const options = [...(current.community_chat_options ?? [])];
      const index = options.findIndex((option) => option.id === id);

      if (index < 0) return current;

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= options.length) return current;

      const [option] = options.splice(index, 1);
      options.splice(nextIndex, 0, option);

      return {
        ...current,
        community_chat_options: options,
      };
    });
  };

  const removeCommunityOption = (id: string) => {
    setValues((current) => ({
      ...current,
      community_chat_options: (current.community_chat_options ?? []).filter(
        (option) => option.id !== id
      ),
    }));
  };

  const openCreateCommunityModal = () => {
    setCommunityModal({
      mode: "create",
      option: createCommunityOption(),
    });
  };

  const openEditCommunityModal = (option: CommunityChatOption) => {
    setCommunityModal({
      mode: "edit",
      option: {
        ...option,
        keywords: [...option.keywords],
      },
    });
  };

  const saveCommunityOptionDraft = (option: CommunityChatOption) => {
    setValues((current) => {
      const existing = current.community_chat_options ?? [];

      if (communityModal?.mode === "edit") {
        return {
          ...current,
          community_chat_options: existing.map((item) =>
            item.id === option.id ? option : item
          ),
        };
      }

      return {
        ...current,
        community_chat_options: [...existing, option],
      };
    });

    setCommunityModal(null);
  };

  if (loading) return <LoadingState label="Cargando configuracion..." />;

  if (!canManageSite(role)) {
    return (
      <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Acceso restringido
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold">
          Esta configuracion solo la puede gestionar administracion del sitio.
        </h1>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <div className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.92),rgba(247,242,236,0.76))] p-6 shadow-[0_22px_70px_rgba(62,42,31,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Configuracion
          </p>
          <div className="mt-3 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="font-display text-4xl font-semibold leading-none sm:text-5xl">
                Panel de ajustes del consultorio
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
                Dividimos la configuracion en vistas mas claras para que el equipo no tenga que
                recorrer una sola pagina larga. Cada pestaña agrupa tareas relacionadas.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="WhatsApp visible" value={values.whatsapp?.trim() ? "Si" : "No"} />
              <MiniStat
                label="Comunidades activas"
                value={String(activeCommunityOptions.length)}
              />
              <MiniStat
                label="Ultimo QR"
                value={values.payment_qr_updated_at ? "Actualizado" : "Pendiente"}
              />
            </div>
          </div>
        </div>

        {message ? <StatusBox tone="success" message={message} /> : null}

        <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-3 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <div className="flex flex-wrap gap-2">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-[22px] px-4 py-3 text-left text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-[var(--color-mocha)] text-white shadow-[0_14px_34px_rgba(62,42,31,0.18)]"
                    : "bg-white/60 text-[var(--color-copy)] hover:bg-white hover:text-[var(--color-ink)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
          <p className="px-2 pt-4 text-sm leading-7 text-[var(--color-copy)]">
            {mainTabs.find((tab) => tab.id === activeTab)?.description}
          </p>
        </section>

        {activeTab === "public" ? (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                  Datos publicos
                </p>
                <h2 className="font-display mt-2 text-3xl font-semibold">
                  Contacto, visibilidad y presencia del sitio
                </h2>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Telefono">
                  <input
                    value={values.phone ?? ""}
                    onChange={(event) => setValue("phone", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <Field label="WhatsApp principal">
                  <input
                    value={values.whatsapp ?? ""}
                    onChange={(event) => setValue("whatsapp", event.target.value)}
                    className="premium-input"
                    placeholder="5917XXXXXXX"
                  />
                </Field>
                <Field label="Correo">
                  <input
                    value={values.email ?? ""}
                    onChange={(event) => setValue("email", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <Field label="Ciudad">
                  <select
                    value={values.city ?? ""}
                    onChange={(event) => setValue("city", event.target.value)}
                    className="premium-input"
                  >
                    <option value="">Selecciona ciudad</option>
                    {boliviaCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Instagram URL">
                  <input
                    value={values.instagram_url ?? ""}
                    onChange={(event) => setValue("instagram_url", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <Field label="TikTok URL">
                  <input
                    value={values.tiktok_url ?? ""}
                    onChange={(event) => setValue("tiktok_url", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <Field label="Google Maps URL">
                  <input
                    value={values.maps_url ?? ""}
                    onChange={(event) => setValue("maps_url", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <Field label="Google Maps embed URL">
                  <input
                    value={values.maps_embed_url ?? ""}
                    onChange={(event) => setValue("maps_embed_url", event.target.value)}
                    className="premium-input"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Direccion">
                    <textarea
                      value={values.address ?? ""}
                      onChange={(event) => setValue("address", event.target.value)}
                      className="premium-input min-h-24"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Horarios">
                    <textarea
                      value={values.business_hours ?? ""}
                      onChange={(event) => setValue("business_hours", event.target.value)}
                      className="premium-input min-h-24"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                  Ajustes del sitio
                </p>
                <h3 className="font-display mt-2 text-3xl font-semibold">
                  Acciones visibles y datos operativos
                </h3>

                <div className="mt-6 grid gap-4">
                <Field label="Acceso flotante de WhatsApp">
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
                      Mostrar acceso flotante en paginas publicas, incluida la landing
                  </label>
                </Field>
                  <Field label="Nombre general de la valoracion publica">
                    <input
                      value={values.assessment_label ?? ""}
                      onChange={(event) => setValue("assessment_label", event.target.value)}
                      className="premium-input"
                      placeholder="Valoracion estetica"
                    />
                  </Field>
                  <Field label="Tipo de cita por defecto para valoracion">
                    <input
                      value={values.assessment_appointment_type ?? ""}
                      onChange={(event) =>
                        setValue("assessment_appointment_type", event.target.value)
                      }
                      className="premium-input"
                      placeholder="Valoracion estetica"
                    />
                  </Field>
                  <Field label="Precio base de la valoracion publica">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={String(values.assessment_price ?? 0)}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          assessment_price: Number(event.target.value),
                        }))
                      }
                      className="premium-input"
                    />
                  </Field>
                  <Field label="Texto footer">
                    <textarea
                      value={values.footer_text ?? ""}
                      onChange={(event) => setValue("footer_text", event.target.value)}
                      className="premium-input min-h-28"
                    />
                  </Field>
                  <div className="rounded-[22px] border border-[rgba(184,138,90,0.12)] bg-[rgba(247,242,236,0.68)] px-4 py-4 text-sm leading-7 text-[var(--color-copy)]">
                    <p className="font-semibold text-[var(--color-ink)]">
                      Estos campos si estan enlazados a la valoracion publica.
                    </p>
                    <p className="mt-2">
                      Se usan como valores globales en el flujo de reserva publica cuando una
                      valoracion no define su propio texto o precio desde un tratamiento o
                      promocion especifica.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.76)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Esta pestaña controla lo que la paciente ve primero.
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  Si aqui todo esta claro, luego el chat guiado y los pagos se sienten mucho mas
                  confiables. Por eso separamos esta vista del resto.
                </p>
              </div>
            </div>

            <div className="xl:col-span-2">
              <button
                disabled={saving}
                onClick={() => void save("Datos publicos guardados correctamente.")}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar datos publicos"}
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "community" ? (
          <section className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                    Chat guiado
                  </p>
                  <h2 className="font-display mt-2 text-3xl font-semibold">
                    Comunidades, bienvenida y respuesta fallback
                  </h2>
                </div>

                <div className="mt-6 grid gap-4">
                  <Field label="Activar chat de comunidades">
                    <label className="mt-1 inline-flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
                      <input
                        type="checkbox"
                        checked={Boolean(values.community_chat_enabled)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            community_chat_enabled: event.target.checked,
                          }))
                        }
                      />
                      Mostrar widget de chat solo en la landing
                    </label>
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Titulo del chat">
                      <input
                        value={values.community_chat_title ?? ""}
                        onChange={(event) =>
                          setValue("community_chat_title", event.target.value)
                        }
                        className="premium-input"
                        placeholder="Comunidades WhatsApp"
                      />
                    </Field>
                    <Field label="Texto del campo">
                      <input
                        value={values.community_chat_placeholder ?? ""}
                        onChange={(event) =>
                          setValue("community_chat_placeholder", event.target.value)
                        }
                        className="premium-input"
                        placeholder='Escribe "promociones" o toca una opcion'
                      />
                    </Field>
                  </div>
                  <Field label="Mensaje de bienvenida">
                    <textarea
                      value={values.community_chat_welcome ?? ""}
                      onChange={(event) => setValue("community_chat_welcome", event.target.value)}
                      className="premium-input min-h-24"
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Boton fallback">
                      <input
                        value={values.community_chat_fallback_button_text ?? ""}
                        onChange={(event) =>
                          setValue("community_chat_fallback_button_text", event.target.value)
                        }
                        className="premium-input"
                        placeholder="Pedir cita"
                      />
                    </Field>
                    <Field label="Enlace fallback">
                      <input
                        value={values.community_chat_fallback_url ?? ""}
                        onChange={(event) =>
                          setValue("community_chat_fallback_url", event.target.value)
                        }
                        className="premium-input"
                        placeholder="/reservar-cita o https://..."
                      />
                    </Field>
                  </div>
                  <Field label="Mensaje fallback">
                    <textarea
                      value={values.community_chat_fallback_text ?? ""}
                      onChange={(event) =>
                        setValue("community_chat_fallback_text", event.target.value)
                      }
                      className="premium-input min-h-24"
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="rounded-[30px] border border-[rgba(184,138,90,0.16)] bg-[linear-gradient(180deg,rgba(255,249,244,0.92),rgba(247,242,236,0.86))] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(110,74,47,0.12)] text-[var(--color-mocha)]">
                      <MessageCircleMore className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {values.community_chat_title?.trim() || "Comunidades WhatsApp"}
                      </p>
                      <p className="mt-1 text-sm leading-7 text-[var(--color-copy)]">
                        {values.community_chat_welcome?.trim() ||
                          "Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {activeCommunityOptions.slice(0, 3).map((option) => (
                      <CommunityPreviewCard key={option.id} option={option} />
                    ))}
                    {activeCommunityOptions.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-[var(--color-border)] bg-white/60 p-4 text-sm leading-7 text-[var(--color-copy)]">
                        Aun no hay comunidades activas. Crea la primera opcion para verla aqui.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    Flujo de usabilidad nuevo
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                    Ahora las comunidades se crean y editan en modal. La lista queda resumida y la
                    pagina deja de crecer hacia abajo cada vez que agregas una opcion.
                  </p>
                </div>
              </div>
            </div>

            <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                    Comunidades
                  </p>
                  <h3 className="font-display mt-2 text-3xl font-semibold">
                    Lista resumida de opciones del chat
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    Edita una opcion puntual solo cuando la necesites. El resto queda limpio y facil de escanear.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateCommunityModal}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/75 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)]"
                >
                  <Plus className="h-4 w-4" />
                  Agregar comunidad
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                {communityOptions.map((option, index, options) => (
                  <CommunityRowCard
                    key={option.id}
                    option={option}
                    index={index}
                    canMoveUp={index > 0}
                    canMoveDown={index < options.length - 1}
                    onEdit={() => openEditCommunityModal(option)}
                    onMove={moveCommunityOption}
                    onRemove={removeCommunityOption}
                  />
                ))}
                {communityOptions.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-[var(--color-border)] bg-[rgba(247,242,236,0.58)] p-5 text-sm leading-7 text-[var(--color-copy)]">
                    Crea opciones como "Promociones VIP", "Academy" o comunidades por ciudad para que el widget responda con enlaces concretos.
                  </div>
                ) : null}
              </div>

              <button
                disabled={saving}
                onClick={() => void save("Chat guiado y comunidades guardados correctamente.")}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar chat guiado"}
              </button>
            </section>
          </section>
        ) : null}

        {activeTab === "qr" ? (
          <section className="space-y-6">
            <div className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-3 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex flex-wrap gap-2">
                {qrTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveQrTab(tab.id)}
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      activeQrTab === tab.id
                        ? "bg-[var(--color-mocha)] text-white"
                        : "bg-white/60 text-[var(--color-copy)] hover:bg-white hover:text-[var(--color-ink)]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {tab.icon}
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {activeQrTab === "payment_qr" ? (
              <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                      QR general de pagos
                    </p>
                    <h2 className="font-display mt-2 text-3xl font-semibold">
                      Una sola imagen para Academy, citas y pagos futuros
                    </h2>
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
                      helperText="Sube aqui la imagen QR general que se mostrara en Academy, citas y cualquier flujo de pago."
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
                    {qrMessage ? (
                      <StatusBox
                        tone={qrMessage.includes("correctamente") ? "success" : "error"}
                        message={qrMessage}
                      />
                    ) : null}
                    <button
                      disabled={savingQr || !paymentQrDraft}
                      onClick={() => void savePaymentQr()}
                      className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <LockKeyhole className="h-4 w-4" />
                      {savingQr ? "Protegiendo cambio..." : "Guardar QR protegido"}
                    </button>
                  </div>

                  <div className="rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5">
                    <p className="text-sm font-semibold text-[var(--color-ink)]">Uso del QR</p>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                      Este QR general se replica para Academy, citas y cualquier otro flujo de pago
                      del sitio. Para cambiarlo se necesita la clave y se guarda auditoria de
                      usuario, fecha y motivo.
                    </p>
                    {values.payment_qr_updated_by_email ? (
                      <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                        Ultimo responsable:{" "}
                        <strong className="text-[var(--color-ink)]">
                          {values.payment_qr_updated_by_email}
                        </strong>
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {isSuperadmin && activeQrTab === "password" ? (
              <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                  Clave del QR
                </p>
                <h2 className="font-display mt-2 text-3xl font-semibold">
                  {isCreatingQrPassword
                    ? "Ingresa por primera vez la clave de proteccion"
                    : "Cambiar la clave de proteccion"}
                </h2>
                {!qrSecurity.available ? (
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                    Cuando apliques la migracion nueva, esta seccion detectara la clave automaticamente.
                  </p>
                ) : null}
                <div
                  className={`mt-6 grid gap-4 ${
                    isCreatingQrPassword ? "md:grid-cols-2" : "md:grid-cols-3"
                  }`}
                >
                  {!isCreatingQrPassword ? (
                    <Field label="Clave actual">
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({
                            ...current,
                            currentPassword: event.target.value,
                          }))
                        }
                        className="premium-input"
                      />
                    </Field>
                  ) : null}
                  <Field label="Nueva clave">
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          newPassword: event.target.value,
                        }))
                      }
                      className="premium-input"
                    />
                  </Field>
                  <Field label="Confirmar nueva clave">
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="premium-input"
                    />
                  </Field>
                </div>
                {passwordMessage ? (
                  <StatusBox
                    tone={passwordMessage.includes("correctamente") ? "success" : "error"}
                    className="mt-4"
                    message={passwordMessage}
                  />
                ) : null}
                <button
                  disabled={savingPassword}
                  onClick={() => void savePassword()}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <LockKeyhole className="h-4 w-4" />
                  {savingPassword
                    ? "Guardando clave..."
                    : isCreatingQrPassword
                      ? "Crear primera clave del QR"
                      : "Cambiar clave del QR"}
                </button>
              </section>
            ) : null}

            {isSuperadmin && activeQrTab === "history" ? (
              <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                  Auditoria
                </p>
                <h2 className="font-display mt-2 text-3xl font-semibold">
                  Historial privado del QR general
                </h2>
                <div className="mt-6 grid gap-4">
                  {auditRows.length === 0 ? (
                    <p className="text-sm leading-7 text-[var(--color-copy)]">
                      Todavia no hay cambios auditados para este QR.
                    </p>
                  ) : (
                    auditRows.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-[22px] bg-[rgba(247,242,236,0.72)] p-4"
                      >
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
            ) : null}
          </section>
        ) : null}
      </div>

      {communityModal ? (
        <CommunityOptionModal
          key={`${communityModal.mode}-${communityModal.option.id}`}
          mode={communityModal.mode}
          initialOption={communityModal.option}
          onClose={() => setCommunityModal(null)}
          onSave={saveCommunityOptionDraft}
        />
      ) : null}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[rgba(184,138,90,0.16)] bg-white/72 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function CommunityPreviewCard({ option }: { option: CommunityChatOption }) {
  return (
    <div className="rounded-[22px] border border-[rgba(184,138,90,0.16)] bg-white/80 p-4">
      <p className="text-sm font-semibold text-[var(--color-ink)]">{option.label}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{option.reply}</p>
      <div className="mt-3 inline-flex rounded-full bg-[var(--color-mocha)] px-4 py-2 text-xs font-semibold text-white">
        {option.button_text}
      </div>
    </div>
  );
}

function CommunityRowCard({
  option,
  index,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMove,
  onRemove,
}: {
  option: CommunityChatOption;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <article className="rounded-[26px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-5 shadow-[0_14px_36px_rgba(62,42,31,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(216,194,174,0.28)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              Opcion {index + 1}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                option.is_active
                  ? "bg-[rgba(42,128,93,0.14)] text-[rgb(36,120,86)]"
                  : "bg-[rgba(76,85,99,0.14)] text-slate-700"
              }`}
            >
              {option.is_active ? "Activa" : "Oculta"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{option.label}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{option.reply}</p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--color-copy)] md:grid-cols-2">
            <InfoMini label="Boton" value={option.button_text} />
            <InfoMini label="Enlace" value={option.button_url} />
            <InfoMini
              label="Palabras clave"
              value={option.keywords.length > 0 ? option.keywords.join(", ") : "Sin palabras clave"}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => onMove(option.id, -1)}
            disabled={!canMoveUp}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-[var(--color-ink)] disabled:opacity-40"
            aria-label="Subir opcion"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(option.id, 1)}
            disabled={!canMoveDown}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-[var(--color-ink)] disabled:opacity-40"
            aria-label="Bajar opcion"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(option.id)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700"
            aria-label="Eliminar opcion"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function CommunityOptionModal({
  mode,
  initialOption,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initialOption: CommunityChatOption;
  onClose: () => void;
  onSave: (option: CommunityChatOption) => void;
}) {
  const [draft, setDraft] = useState<CommunityChatOption>({
    ...initialOption,
    keywords: [...initialOption.keywords],
  });

  const canSave =
    draft.label.trim() &&
    draft.reply.trim() &&
    draft.button_text.trim() &&
    draft.button_url.trim();

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[rgba(43,33,27,0.42)] p-4 pt-6 backdrop-blur-md sm:items-center sm:pt-4">
      <div className="w-full max-w-3xl rounded-[32px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.98)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.28)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              {mode === "create" ? "Nueva comunidad" : "Editar comunidad"}
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)]">
              {mode === "create"
                ? "Configura una opcion del chat guiado"
                : "Actualiza esta opcion del chat"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
              Guarda la opcion y la modal se cerrara automaticamente para que vuelvas a la lista resumida.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/60"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Field label="Nombre visible">
            <input
              value={draft.label}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              className="premium-input"
              placeholder="Promociones VIP"
            />
          </Field>
          <Field label="Estado">
            <label className="mt-1 inline-flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] bg-white/80 px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, is_active: event.target.checked }))
                }
              />
              Disponible en el widget
            </label>
          </Field>
          <div className="md:col-span-2">
            <Field label="Palabras clave">
              <input
                value={draft.keywords.join(", ")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    keywords: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                className="premium-input"
                placeholder="promo, promociones, whatsapp vip"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Respuesta del bot">
              <textarea
                value={draft.reply}
                onChange={(event) => setDraft((current) => ({ ...current, reply: event.target.value }))}
                className="premium-input min-h-28"
                placeholder="Te comparto la comunidad de promociones activas para que revises novedades y cupos."
              />
            </Field>
          </div>
          <Field label="Texto del boton">
            <input
              value={draft.button_text}
              onChange={(event) =>
                setDraft((current) => ({ ...current, button_text: event.target.value }))
              }
              className="premium-input"
              placeholder="Abrir comunidad"
            />
          </Field>
          <Field label="Enlace del boton">
            <input
              value={draft.button_url}
              onChange={(event) =>
                setDraft((current) => ({ ...current, button_url: event.target.value }))
              }
              className="premium-input"
              placeholder="https://chat.whatsapp.com/..."
            />
          </Field>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              onSave({
                ...draft,
                label: draft.label.trim(),
                reply: draft.reply.trim(),
                button_text: draft.button_text.trim(),
                button_url: draft.button_url.trim(),
                keywords: draft.keywords.map((item) => item.trim()).filter(Boolean),
              })
            }
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {mode === "create" ? "Guardar comunidad" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
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

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(184,138,90,0.12)] bg-white/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-[var(--color-ink)]">{value}</p>
    </div>
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
    <div
      className={`${className} rounded-[20px] px-4 py-3 text-sm font-semibold ${
        tone === "success"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {message}
    </div>
  );
}

function createCommunityOption(): CommunityChatOption {
  return {
    id: crypto.randomUUID(),
    label: "",
    keywords: [],
    reply: "",
    button_text: "Abrir comunidad",
    button_url: "",
    is_active: true,
  };
}
