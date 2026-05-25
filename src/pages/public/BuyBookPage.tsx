import { useEffect, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, BadgeCheck, CreditCard, FileUp, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { z } from "zod";

import { LoadingState } from "../../components/common/AsyncState";
import { ContentCover } from "../../components/ui/ContentCover";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { createBookOrder, uploadPaymentReceipt } from "../../services/bookOrderService";
import { getBookBySlug } from "../../services/bookService";
import { updateMyProfile } from "../../services/profileService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { normalizeDocumentNumber } from "../../utils/documentNumber";
import { formatMoney } from "../../utils/text";

const schema = z.object({
  full_name: z.string().min(3, "Escribe tu nombre completo"),
  document_number: z.string().min(5, "Escribe tu numero de carnet"),
  phone: z.string().min(6, "Escribe un celular valido"),
  city: z.string().min(2, "Selecciona tu ciudad"),
  email: z.string().email("Correo invalido"),
  receipt: z.instanceof(File, { message: "Sube tu comprobante" }),
});

type Values = z.infer<typeof schema>;

type Step = 1 | 2;

export function BuyBookPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { slug = "" } = useParams();
  const [book, setBook] = useState<Awaited<ReturnType<typeof getBookBySlug>> | undefined>(undefined);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? "",
      document_number: profile?.document_number ?? user?.user_metadata.document_number ?? "",
      phone: profile?.phone ?? "",
      city: profile?.city ?? "",
      email: profile?.email ?? user?.email ?? "",
    },
  });

  useEffect(() => {
    getBookBySlug(slug).then(setBook);
  }, [slug]);

  useEffect(() => {
    getSiteSettings()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  if (book === undefined) return <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24"><LoadingState label="Cargando libro..." /></section>;
  if (!book) return <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24"><LoadingState label="No encontramos este libro." /></section>;

  const paymentQrImage = settings?.payment_qr_image ?? null;
  const values = form.watch();

  const goToPaymentStep = async () => {
    setError("");
    const valid = await form.trigger(["full_name", "document_number", "phone", "city", "email"]);
    if (!valid) return;
    setStep(2);
  };

  const onSubmit = async (currentValues: Values) => {
    setError("");
    setMessage("");

    try {
      if (!paymentQrImage) {
        throw new Error("Aun no configuramos el QR general de pagos. El admin puede subirlo desde Panel / Configuracion.");
      }

      const documentNumber = normalizeDocumentNumber(currentValues.document_number);

      if (user?.id) {
        await updateMyProfile(user.id, {
          full_name: currentValues.full_name,
          phone: currentValues.phone,
          city: currentValues.city,
          document_number: documentNumber,
        });
        await refreshProfile();
      }

      const receiptPath = await uploadPaymentReceipt(currentValues.receipt, `book-${documentNumber}`);
      await createBookOrder({
        book_id: book.id,
        user_id: user?.id ?? null,
        full_name: currentValues.full_name,
        document_number: documentNumber,
        email: currentValues.email,
        phone: currentValues.phone,
        city: currentValues.city,
        payment_receipt_path: receiptPath,
      });

      setMessage(
        user?.id
          ? "Recibimos tu comprobante. Cuando administracion apruebe el pago, te enviaremos el token por WhatsApp y tambien aparecera en tu panel."
          : "Recibimos tu comprobante. Cuando administracion apruebe el pago, te enviaremos el token por WhatsApp. Si luego te registras con el mismo carnet, esta compra tambien aparecera en tu panel."
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError, "No pudimos registrar la compra del libro."));
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
      <div className="grid gap-8 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
        <aside className="grid gap-5 xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white/75 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <ContentCover src={book.cover_image} alt={book.title} label="Libro" wrapperClassName="aspect-[4/5] w-full rounded-none" />
            <div className="grid gap-3 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{book.author}</p>
                <h1 className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{book.title}</h1>
              </div>
              <p className="text-sm leading-7 text-[var(--color-copy)]">{book.description}</p>
              <p className="text-xl font-semibold text-[var(--color-ink)]">{formatMoney(book.price)}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <div className="grid gap-3">
              <StepBadge
                active={step === 1}
                done={step === 2}
                icon={<UserRound className="h-4 w-4" />}
                title="Paso 1"
                description="Datos del comprador"
              />
              <StepBadge
                active={step === 2}
                done={Boolean(message)}
                icon={<CreditCard className="h-4 w-4" />}
                title="Paso 2"
                description="Pago y comprobante"
              />
            </div>
          </div>
        </aside>

        <form onSubmit={form.handleSubmit(onSubmit)} className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Compra del libro</p>
              <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)]">
                {step === 1 ? "Completa tus datos" : "Sube tu comprobante"}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
                {step === 1
                  ? "Primero registramos tu informacion para vincular la compra por carnet. Luego pasamos al pago."
                  : "Usa el QR general del sistema, revisa tus datos y sube el comprobante para que administracion valide el pedido."}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[rgba(247,242,236,0.82)] p-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`min-w-[132px] rounded-full px-4 py-2 text-sm font-semibold transition ${step === 1 ? "bg-[var(--color-mocha)] text-white" : "text-[var(--color-copy)]"}`}
              >
                Datos
              </button>
              <button
                type="button"
                onClick={() => void goToPaymentStep()}
                className={`min-w-[132px] rounded-full px-4 py-2 text-sm font-semibold transition ${step === 2 ? "bg-[var(--color-mocha)] text-white" : "text-[var(--color-copy)]"}`}
              >
                Pago
              </button>
            </div>
          </div>

          {step === 1 ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Field label="Nombre completo" error={form.formState.errors.full_name?.message}>
                <input {...form.register("full_name")} className="premium-input mt-2" />
              </Field>
              <Field label="Numero de carnet / CI" error={form.formState.errors.document_number?.message}>
                <input
                  {...form.register("document_number", {
                    onChange: (event) => {
                      form.setValue("document_number", normalizeDocumentNumber(event.target.value), { shouldValidate: true });
                    },
                  })}
                  className="premium-input mt-2"
                />
              </Field>
              <Field label="WhatsApp" error={form.formState.errors.phone?.message}>
                <input {...form.register("phone")} className="premium-input mt-2" />
              </Field>
              <Field label="Ciudad" error={form.formState.errors.city?.message}>
                <select {...form.register("city")} className="premium-input mt-2">
                  <option value="">Selecciona ciudad</option>
                  {boliviaCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Correo" error={form.formState.errors.email?.message} className="md:col-span-2">
                <input {...form.register("email")} className="premium-input mt-2" />
              </Field>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_320px]">
              <div className="grid gap-5">
                <div className="rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">Resumen del comprador</p>
                  <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--color-copy)] sm:grid-cols-2">
                    <InfoLine label="Nombre" value={values.full_name} />
                    <InfoLine label="Carnet" value={values.document_number} />
                    <InfoLine label="WhatsApp" value={values.phone} />
                    <InfoLine label="Ciudad" value={values.city} />
                    <InfoLine label="Correo" value={values.email} className="sm:col-span-2" />
                  </div>
                </div>

                <div className="rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--color-mocha)]">
                      <FileUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">Comprobante de pago</p>
                      <p className="text-sm leading-7 text-[var(--color-copy)]">Sube imagen o PDF del deposito, transferencia o captura QR.</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) form.setValue("receipt", file, { shouldValidate: true });
                      }}
                      className="premium-input"
                    />
                    {form.formState.errors.receipt?.message ? <span className="mt-1 block text-sm text-red-700">{form.formState.errors.receipt.message}</span> : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--color-border)] bg-white/90 p-5">
                <p className="text-sm font-semibold text-[var(--color-ink)]">Pago</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  Monto a pagar: <strong className="text-[var(--color-ink)]">{formatMoney(book.price)}</strong>
                </p>

                {paymentQrImage ? (
                  <div className="mt-4 grid gap-4">
                    <img src={paymentQrImage} alt="QR general de pagos" className="mx-auto aspect-square w-full max-w-[220px] rounded-[20px] object-contain" />
                    <a
                      href={paymentQrImage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex justify-center rounded-full border border-[var(--color-border)] bg-[rgba(247,242,236,0.82)] px-4 py-2 text-sm font-semibold"
                    >
                      Ver o descargar QR
                    </a>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                    Aun no configuramos el QR general de pagos. El admin puede subirlo desde Panel / Configuracion.
                  </p>
                )}

                <div className="mt-4 rounded-[20px] bg-[rgba(247,242,236,0.82)] p-4 text-sm leading-7 text-[var(--color-copy)]">
                  El pedido se registra con tu carnet. Cuando el pago sea aprobado, recibiras tu token por WhatsApp y tambien en tu panel si ya tienes cuenta.
                </div>
              </div>
            </div>
          )}

          {error ? <p className="mt-6 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800">{error}</p> : null}
          {message ? <p className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-800">{message}</p> : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a datos
              </button>
            ) : null}

            {step === 1 ? (
              <button
                type="button"
                onClick={() => void goToPaymentStep()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
              >
                Continuar al pago
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                disabled={form.formState.isSubmitting || !paymentQrImage}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {form.formState.isSubmitting ? "Enviando..." : "Enviar comprobante"}
                <BadgeCheck className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

function StepBadge({
  active,
  done,
  icon,
  title,
  description,
}: {
  active: boolean;
  done: boolean;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className={`grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border px-4 py-3 ${active ? "border-[var(--color-mocha)] bg-[rgba(216,194,174,0.18)]" : "border-[var(--color-border)] bg-[rgba(247,242,236,0.72)]"}`}>
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${done || active ? "bg-[var(--color-mocha)] text-white" : "bg-white text-[var(--color-copy)]"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
        <p className="text-sm text-[var(--color-copy)]">{description}</p>
      </div>
    </div>
  );
}

function InfoLine({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--color-ink)]">{value?.trim() ? value : "Sin dato"}</p>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
