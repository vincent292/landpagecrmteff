import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { boliviaCities } from "../../data/cities";
import { cn } from "../../lib/cn";
import { createInformationRequest } from "../../services/requestService";
import { renderWhatsAppTemplate } from "../../utils/whatsapp";

const schema = z.object({
  full_name: z.string().min(3, "Escribe tu nombre completo"),
  phone: z.string().min(7, "Escribe un WhatsApp valido"),
  city: z.string().min(2, "Indica tu ciudad"),
  interest_type: z.enum(["Tratamiento", "Promoción", "Curso", "Libro", "Evento", "General"]),
  interest_title: z.string().min(2, "Indica el interes"),
  contact_preference: z.enum(["WhatsApp", "Llamada", "Correo"]),
  message: z.string().optional(),
  privacy_accepted: z.boolean().refine(Boolean, "Debes aceptar la politica de privacidad"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  interest: string;
  interestId?: string | null;
  interestType?: FormValues["interest_type"];
  whatsappTemplate?: string | null;
  contentPrice?: number | null;
  contentCity?: string | null;
  onClose: () => void;
};

export function InfoRequestModal({
  open,
  interest,
  interestId = null,
  interestType = "General",
  whatsappTemplate = null,
  contentPrice = null,
  contentCity = null,
  onClose,
}: Props) {
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [messageTouched, setMessageTouched] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      interest_type: interestType,
      interest_title: interest,
      contact_preference: "WhatsApp",
      privacy_accepted: false,
    },
  });
  const fullNameValue = watch("full_name");
  const interestTypeValue = watch("interest_type");
  const interestTitleValue = watch("interest_title");
  const messageRegister = register("message");

  useEffect(() => {
    if (!open) return;

    setSent(false);
    setSubmitError("");
    setMessageTouched(false);
    reset({
      full_name: "",
      phone: "",
      city: "",
      interest_type: interestType,
      interest_title: interest,
      contact_preference: "WhatsApp",
      message: buildSuggestedMessage("", interestType, interest),
      privacy_accepted: false,
    });
  }, [interest, interestType, open, reset]);

  useEffect(() => {
    if (!open || messageTouched) return;

    setValue(
      "message",
      buildSuggestedMessage(fullNameValue ?? "", interestTypeValue, interestTitleValue ?? interest),
      { shouldDirty: false, shouldTouch: false }
    );
  }, [fullNameValue, interest, interestTitleValue, interestTypeValue, messageTouched, open, setValue]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const onSubmit = async (values: FormValues) => {
    setSubmitError("");
    try {
      await createInformationRequest({
        full_name: values.full_name,
        phone: values.phone,
        city: values.city,
        interest_type: values.interest_type,
        interest_id: interestId,
        interest_title: values.interest_title,
        contact_preference: values.contact_preference,
        message: values.message ?? null,
        whatsapp_prefill_message:
          renderWhatsAppTemplate(whatsappTemplate, {
            nombre: values.full_name,
            telefono: values.phone,
            ciudad: values.city || contentCity || "",
            titulo: values.interest_title,
            tipo: values.interest_type,
            precio: contentPrice ?? "",
          }) || null,
        privacy_accepted: values.privacy_accepted,
      });
      setSent(true);
      window.setTimeout(onClose, 1400);
    } catch {
      setSubmitError("No pudimos registrar la solicitud. Intentalo otra vez.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex min-h-screen items-center justify-center bg-[rgba(43,33,27,0.42)] px-4 py-8 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.96)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.28)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              Solicitud privada
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)]">
              Te contactaremos con una orientacion personalizada.
            </h2>
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

        {sent ? (
          <div className="mt-8 rounded-[28px] border border-[rgba(111,122,96,0.22)] bg-[rgba(111,122,96,0.08)] p-6">
            <CheckCircle2 className="h-8 w-8 text-[rgb(82,101,78)]" />
            <h3 className="mt-4 text-2xl font-semibold text-[var(--color-ink)]">
              Solicitud enviada.
            </h3>
            <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
              El equipo revisara tu mensaje y te contactara por el canal elegido.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4 md:grid-cols-2">
            <Field label="Nombre completo" error={errors.full_name?.message}>
              <input {...register("full_name")} className="premium-input" />
            </Field>
            <Field label="WhatsApp / celular" error={errors.phone?.message}>
              <input {...register("phone")} className="premium-input" />
            </Field>
            <Field label="Ciudad" error={errors.city?.message}>
              <select {...register("city")} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city}>{city}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de interes" error={errors.interest_type?.message}>
              <input {...register("interest_type")} readOnly className="premium-input bg-white/50 text-[var(--color-copy)]" />
            </Field>
            <Field label="Interes seleccionado" error={errors.interest_title?.message}>
              <input {...register("interest_title")} readOnly className="premium-input bg-white/50 text-[var(--color-copy)]" />
            </Field>
            <Field label="Preferencia de contacto" error={errors.contact_preference?.message}>
              <select {...register("contact_preference")} className="premium-input">
                <option>WhatsApp</option>
                <option>Llamada</option>
                <option>Correo</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Mensaje opcional" error={errors.message?.message}>
                <textarea
                  {...messageRegister}
                  onChange={(event) => {
                    messageRegister.onChange(event);
                    setMessageTouched(true);
                  }}
                  className="premium-input min-h-28 resize-none"
                />
              </Field>
              <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                Lo dejamos preescrito para ayudarte a empezar, pero puedes cambiarlo como quieras.
              </p>
            </div>
            <label className="flex gap-3 text-sm leading-6 text-[var(--color-copy)] md:col-span-2">
              <input type="checkbox" {...register("privacy_accepted")} className="mt-1" />
              Acepto la politica de privacidad y autorizo el contacto para recibir informacion.
            </label>
            {errors.privacy_accepted?.message ? (
              <p className="text-sm text-red-700 md:col-span-2">{errors.privacy_accepted.message}</p>
            ) : null}
            {submitError ? <p className="text-sm text-red-700 md:col-span-2">{submitError}</p> : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-[var(--color-surface)] shadow-[0_18px_40px_rgba(110,74,47,0.18)] md:col-span-2",
                isSubmitting && "opacity-70"
              )}
            >
              {isSubmitting ? "Enviando..." : "Enviar solicitud"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

function buildSuggestedMessage(
  fullName: string,
  interestType: FormValues["interest_type"],
  interestTitle: string
) {
  const cleanName = fullName.trim();
  const intro = cleanName ? `Hola, mi nombre es ${cleanName}` : "Hola";
  const bridge = cleanName ? " y " : ", ";
  const cleanTitle = interestTitle.trim();

  if (interestType === "Tratamiento" && cleanTitle) {
    return `${intro}${bridge}me gustaria saber mas sobre el tratamiento ${cleanTitle}.`;
  }

  if (interestType === "Promoci\u00f3n" && cleanTitle) {
    return `${intro}${bridge}me gustaria saber mas sobre la promocion ${cleanTitle}.`;
  }

  if (interestType === "Curso" && cleanTitle) {
    return `${intro}${bridge}me gustaria saber mas sobre el programa Academy ${cleanTitle}.`;
  }

  if (interestType === "Libro" && cleanTitle) {
    return `${intro}${bridge}me gustaria saber mas sobre el libro ${cleanTitle}.`;
  }

  if (interestType === "Evento" && cleanTitle) {
    return `${intro}${bridge}me gustaria saber mas sobre el evento ${cleanTitle}.`;
  }

  if (cleanTitle && cleanTitle.toLowerCase() !== "consulta general") {
    return `${intro}${bridge}me gustaria saber mas sobre ${cleanTitle}.`;
  }

  return `${intro}${bridge}me gustaria saber mas sobre la atencion de la Dra. Estefany.`;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--color-ink)]">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
