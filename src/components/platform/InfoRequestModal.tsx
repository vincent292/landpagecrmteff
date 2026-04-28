import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createInformationRequest } from "../../services/requestService";
import { cn } from "../../lib/cn";

const schema = z.object({
  full_name: z.string().min(3, "Escribe tu nombre completo"),
  phone: z.string().min(7, "Escribe un WhatsApp válido"),
  city: z.string().min(2, "Indica tu ciudad"),
  interest_type: z.enum(["Tratamiento", "Promoción", "Curso", "Evento", "General"]),
  interest_title: z.string().min(2, "Indica el interés"),
  contact_preference: z.enum(["WhatsApp", "Llamada", "Correo"]),
  message: z.string().optional(),
  privacy_accepted: z.boolean().refine(Boolean, "Debes aceptar la política de privacidad"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  interest: string;
  interestId?: string | null;
  interestType?: FormValues["interest_type"];
  onClose: () => void;
};

export function InfoRequestModal({
  open,
  interest,
  interestId = null,
  interestType = "General",
  onClose,
}: Props) {
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
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

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setSubmitError("");
    reset({
      full_name: "",
      phone: "",
      city: "",
      interest_type: interestType,
      interest_title: interest,
      contact_preference: "WhatsApp",
      message: "",
      privacy_accepted: false,
    });
  }, [interest, interestType, open, reset]);

  if (!open) return null;

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
        privacy_accepted: values.privacy_accepted,
      });
      setSent(true);
      window.setTimeout(onClose, 1400);
    } catch {
      setSubmitError("No pudimos registrar la solicitud. Inténtalo otra vez.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(43,33,27,0.42)] px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.96)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.28)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              Solicitud privada
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)]">
              Te contactaremos con una orientación personalizada.
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
              El equipo revisará tu mensaje y te contactará por el canal elegido.
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
              <input {...register("city")} className="premium-input" />
            </Field>
            <Field label="Tipo de interés" error={errors.interest_type?.message}>
              <select {...register("interest_type")} className="premium-input">
                <option>Tratamiento</option>
                <option>Promoción</option>
                <option>Curso</option>
                <option>Evento</option>
                <option>General</option>
              </select>
            </Field>
            <Field label="Interés seleccionado" error={errors.interest_title?.message}>
              <input {...register("interest_title")} className="premium-input" />
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
                <textarea {...register("message")} className="premium-input min-h-28 resize-none" />
              </Field>
            </div>
            <label className="flex gap-3 text-sm leading-6 text-[var(--color-copy)] md:col-span-2">
              <input type="checkbox" {...register("privacy_accepted")} className="mt-1" />
              Acepto la política de privacidad y autorizo el contacto para recibir información.
            </label>
            {errors.privacy_accepted?.message && (
              <p className="text-sm text-red-700 md:col-span-2">{errors.privacy_accepted.message}</p>
            )}
            {submitError && <p className="text-sm text-red-700 md:col-span-2">{submitError}</p>}
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
    </div>
  );
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
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}
