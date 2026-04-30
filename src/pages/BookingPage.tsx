import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import gsap from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  CirclePlay,
  Clock3,
  CreditCard,
  LoaderCircle,
  MessageCircleMore,
  QrCode,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Footer } from "../components/layout/Footer";
import { GlassCard } from "../components/ui/GlassCard";
import { cn } from "../lib/cn";

type ServiceOption = {
  id: string;
  name: string;
  duration: string;
  amount: string;
  description: string;
};

type ScheduleDay = {
  id: string;
  label: string;
  slots: string[];
};

type PromoItem = {
  id: string;
  title: string;
  benefit: string;
  videoLabel: string;
};

type PatientForm = {
  fullName: string;
  whatsapp: string;
  email: string;
  notes: string;
};

type StepMeta = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

const serviceOptions: ServiceOption[] = [
  {
    id: "valoracion-integral",
    name: "Valoración estética integral",
    duration: "45 min",
    amount: "Bs. 180",
    description:
      "Consulta inicial para revisar objetivos, armonía facial o corporal y definir un protocolo médico personalizado.",
  },
  {
    id: "valoracion-ortomolecular",
    name: "Valoración ortomolecular",
    duration: "50 min",
    amount: "Bs. 220",
    description:
      "Enfoque clínico orientado a bienestar, energía, balance interno y acompañamiento preventivo.",
  },
];

const scheduleDays: ScheduleDay[] = [
  {
    id: "lunes",
    label: "Lunes 12",
    slots: ["09:30", "11:00", "15:00"],
  },
  {
    id: "miercoles",
    label: "Miércoles 14",
    slots: ["10:00", "12:30", "16:30"],
  },
  {
    id: "viernes",
    label: "Viernes 16",
    slots: ["09:00", "11:30", "14:30"],
  },
];

const promoItems: PromoItem[] = [
  {
    id: "hydraglow",
    title: "Hydraglow de bienvenida",
    benefit: "Incluye diagnóstico facial y beneficio especial en protocolo de hidratación.",
    videoLabel: "Ver testimonio",
  },
  {
    id: "wellness",
    title: "Evaluación wellness premium",
    benefit: "Ideal para pacientes que quieren iniciar un plan integral de bienestar y belleza natural.",
    videoLabel: "Ver experiencia",
  },
];

const qrPattern = [
  "1110011",
  "1010101",
  "1110111",
  "0011100",
  "1110111",
  "1010001",
  "1111011",
];

const steps: StepMeta[] = [
  {
    id: "intro",
    label: "Inicio",
    eyebrow: "Paso 1",
    title: "Antes de agendar, revisa si alguna promoción acompaña mejor tu valoración.",
    description:
      "Puedes continuar sin promo, pero si eliges una la dejamos asociada a tu solicitud para que el equipo la considere al validar tu cita.",
  },
  {
    id: "service",
    label: "Valoración",
    eyebrow: "Paso 2",
    title: "Elige el tipo de valoración que mejor se ajusta a lo que deseas trabajar.",
    description:
      "Aquí definimos el enfoque de la consulta y el monto que deberá validarse antes de confirmar el espacio en agenda.",
  },
  {
    id: "schedule",
    label: "Agenda",
    eyebrow: "Paso 3",
    title: "Selecciona un día y un horario disponible para tu primera visita.",
    description:
      "El espacio quedará reservado de forma provisional hasta que el administrador valide el pago y confirme por WhatsApp.",
  },
  {
    id: "details",
    label: "Datos",
    eyebrow: "Paso 4",
    title: "Comparte tus datos para que el equipo pueda ubicarte y darte seguimiento.",
    description:
      "Solo pedimos lo necesario para confirmar la valoración y contactarte con una experiencia simple y elegante.",
  },
  {
    id: "payment",
    label: "Pago",
    eyebrow: "Paso 5",
    title: "Revisa el costo, paga al QR y sube tu comprobante para enviar la solicitud.",
    description:
      "Cuando el pago sea verificado, el equipo aprobará la cita en la agenda del doctor y te enviará la confirmación a tu WhatsApp.",
  },
];

const initialForm: PatientForm = {
  fullName: "",
  whatsapp: "",
  email: "",
  notes: "",
};

const transitionEase = "power3.out";

export function BookingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceOptions[0].id);
  const [selectedDayId, setSelectedDayId] = useState(scheduleDays[0].id);
  const [selectedSlot, setSelectedSlot] = useState(scheduleDays[0].slots[0]);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(promoItems[0].id);
  const [patientForm, setPatientForm] = useState<PatientForm>(initialForm);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLSpanElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const submitTimeoutRef = useRef<number | null>(null);

  const selectedService =
    serviceOptions.find((service) => service.id === selectedServiceId) ?? serviceOptions[0];

  const selectedDay = scheduleDays.find((day) => day.id === selectedDayId) ?? scheduleDays[0];

  const selectedPromo = useMemo(
    () => promoItems.find((promo) => promo.id === selectedPromoId) ?? null,
    [selectedPromoId]
  );

  const currentStepMeta = steps[currentStep];
  const progress = submitted ? 100 : ((currentStep + 1) / steps.length) * 100;

  const detailsStepComplete =
    patientForm.fullName.trim().length > 0 && patientForm.whatsapp.trim().length > 0;

  const canContinue =
    currentStep === 3
      ? detailsStepComplete
      : currentStep === 4
        ? uploadedFileName.length > 0
        : true;

  useEffect(() => {
    const progressFill = progressFillRef.current;

    if (!progressFill) return;

    gsap.to(progressFill, {
      width: `${progress}%`,
      duration: 0.7,
      ease: transitionEase,
    });
  }, [progress]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        stage,
        { autoAlpha: 0, y: 20, filter: "blur(16px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.6,
          ease: transitionEase,
        }
      );

      gsap.fromTo(
        "[data-step-animate]",
        { autoAlpha: 0, y: 28, filter: "blur(18px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.85,
          stagger: 0.08,
          ease: transitionEase,
        }
      );
    }, stage);

    shellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    return () => ctx.revert();
  }, [currentStep, isSubmitting, submitted]);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current !== null) {
        window.clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handleDaySelect = (day: ScheduleDay) => {
    setSelectedDayId(day.id);
    setSelectedSlot(day.slots[0]);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setUploadedFileName(file?.name ?? "");
  };

  const handleFieldChange =
    (field: keyof PatientForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setPatientForm((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleNext = () => {
    if (!canContinue || currentStep >= steps.length - 1) return;
    setCurrentStep((step) => step + 1);
  };

  const handleBack = () => {
    if (currentStep === 0) return;
    setCurrentStep((step) => step - 1);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!uploadedFileName || !detailsStepComplete) return;

    setIsSubmitting(true);

    submitTimeoutRef.current = window.setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 1800);
  };

  const renderStepContent = () => {
    if (isSubmitting) {
      return (
        <div className="flex min-h-[440px] flex-col items-center justify-center text-center">
          <div
            data-step-animate
            className="flex h-20 w-20 items-center justify-center rounded-full border border-[rgba(184,138,90,0.22)] bg-[rgba(255,249,244,0.72)] shadow-[0_20px_50px_rgba(110,74,47,0.10)]"
          >
            <LoaderCircle className="h-9 w-9 animate-spin text-[var(--color-accent-strong)]" />
          </div>

          <p
            data-step-animate
            className="mt-8 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent-strong)]"
          >
            Enviando solicitud
          </p>

          <h2
            data-step-animate
            className="font-display mt-4 max-w-2xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
          >
            Estamos registrando tu valoración y dejando el pago listo para revisión.
          </h2>

          <p
            data-step-animate
            className="mt-5 max-w-xl text-sm leading-7 text-[var(--color-copy)] md:text-base"
          >
            En cuanto el administrador valide el comprobante, la cita se confirmara en la
            agenda del doctor y te llegara el mensaje por WhatsApp.
          </p>
        </div>
      );
    }

    if (submitted) {
      return (
        <div className="flex min-h-[440px] flex-col justify-center">
          <div
            data-step-animate
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.56)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Solicitud recibida
          </div>

          <h2
            data-step-animate
            className="font-display mt-6 max-w-3xl text-4xl font-semibold leading-[0.94] text-[var(--color-ink)] md:text-6xl"
          >
            Tu valoración quedó pendiente de confirmación.
          </h2>

          <p
            data-step-animate
            className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-copy)]"
          >
            El equipo revisará el comprobante, comparará el pago y, si todo está correcto,
            aprobará tu cita en agenda. La confirmación final llegará al número de WhatsApp
            que compartiste.
          </p>

          <div data-step-animate className="mt-8 grid gap-4 md:grid-cols-3">
            <GlassCard className="p-5">
              <p className="text-sm text-[var(--color-copy)]">WhatsApp</p>
              <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                {patientForm.whatsapp}
              </p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm text-[var(--color-copy)]">Valoración</p>
              <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                {selectedService.name}
              </p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-sm text-[var(--color-copy)]">Horario solicitado</p>
              <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                {selectedDay.label} · {selectedSlot}
              </p>
            </GlassCard>
          </div>

          <div data-step-animate className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-[rgba(184,138,90,0.30)] bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-[var(--color-surface)] shadow-[0_18px_40px_rgba(110,74,47,0.18)] transition duration-500 hover:-translate-y-1 hover:bg-[var(--color-mocha)]"
            >
              Volver a la landing
            </Link>

            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setCurrentStep(0);
                setUploadedFileName("");
                setPatientForm(initialForm);
                setSelectedPromoId(promoItems[0].id);
                setSelectedServiceId(serviceOptions[0].id);
                setSelectedDayId(scheduleDays[0].id);
                setSelectedSlot(scheduleDays[0].slots[0]);
              }}
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.56)] px-6 py-3.5 text-sm font-semibold text-[var(--color-ink)] transition duration-500 hover:-translate-y-1 hover:bg-[rgba(255,249,244,0.8)]"
            >
              Crear otra solicitud
            </button>
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-8">
            <div>
              <div
                data-step-animate
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.48)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
              >
                <BadgePercent className="h-4 w-4" />
                Promociones activas
              </div>

              <h2
                data-step-animate
                className="font-display mt-6 max-w-3xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
              >
                Empieza con una vista corta y guiada, sin formularios eternos.
              </h2>

              <p
                data-step-animate
                className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base"
              >
                Primero te mostramos una promo opcional, luego eliges la valoración,
                después el horario, y al final te mostramos el costo junto al QR para
                completar la solicitud con una experiencia más fluida.
              </p>
            </div>

            <div data-step-animate className="grid gap-4 lg:grid-cols-2">
              {promoItems.map((promo) => (
                <button
                  key={promo.id}
                  type="button"
                  onClick={() =>
                    setSelectedPromoId((current) => (current === promo.id ? null : promo.id))
                  }
                  className={cn(
                    "group rounded-[28px] border p-5 text-left transition duration-500 hover:-translate-y-1",
                    selectedPromoId === promo.id
                      ? "border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.76)] shadow-[0_20px_50px_rgba(110,74,47,0.10)]"
                      : "border-[var(--color-border)] bg-[rgba(255,249,244,0.46)] hover:border-[rgba(184,138,90,0.28)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-ink)]">
                        {promo.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                        {promo.benefit}
                      </p>
                    </div>

                    <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[rgba(216,194,174,0.30)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                      <CirclePlay className="h-4 w-4" />
                      {promo.videoLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div data-step-animate className="grid gap-4 md:grid-cols-3">
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[var(--color-accent-strong)]" />
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Paso a paso
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  Una sola vista, menos saturacion y mejor foco en cada decision.
                </p>
              </GlassCard>
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-[var(--color-accent-strong)]" />
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Revisión manual
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  El pago se valida antes de bloquear la agenda del doctor.
                </p>
              </GlassCard>
              <GlassCard className="p-5">
                <div className="flex items-center gap-3">
                  <MessageCircleMore className="h-5 w-5 text-[var(--color-accent-strong)]" />
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Confirmación por WhatsApp
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                  Cuando todo esté verificado, te confirmaremos directamente al número registrado.
                </p>
              </GlassCard>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-7">
            <div>
              <p
                data-step-animate
                className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
              >
                Tipo de valoración
              </p>

              <h2
                data-step-animate
                className="font-display mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
              >
                Elige una valoración alineada con tu objetivo estético o de bienestar.
              </h2>
            </div>

            <div className="grid gap-4">
              {serviceOptions.map((service) => (
                <button
                  key={service.id}
                  data-step-animate
                  type="button"
                  onClick={() => setSelectedServiceId(service.id)}
                  className={cn(
                    "rounded-[28px] border p-6 text-left transition duration-500 hover:-translate-y-1",
                    selectedServiceId === service.id
                      ? "border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.78)] shadow-[0_20px_50px_rgba(110,74,47,0.10)]"
                      : "border-[var(--color-border)] bg-[rgba(255,249,244,0.46)]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-[var(--color-ink)]">
                      {service.name}
                    </h3>

                    <div className="flex items-center gap-3 text-sm text-[var(--color-copy)]">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(216,194,174,0.18)] px-3 py-1.5">
                        <Clock3 className="h-4 w-4" />
                        {service.duration}
                      </span>
                      <span className="rounded-full bg-[rgba(216,194,174,0.28)] px-3 py-1.5 font-semibold text-[var(--color-mocha)]">
                        {service.amount}
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
                    {service.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-7">
            <div>
              <p
                data-step-animate
                className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
              >
                Agenda disponible
              </p>

              <h2
                data-step-animate
                className="font-display mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
              >
                Selecciona el momento que mejor se adapte a ti.
              </h2>
            </div>

            <div data-step-animate className="flex flex-wrap gap-3">
              {scheduleDays.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => handleDaySelect(day)}
                  className={cn(
                    "rounded-full border px-4 py-2.5 text-sm font-medium transition duration-300",
                    selectedDayId === day.id
                      ? "border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.74)] text-[var(--color-ink)] shadow-[0_14px_30px_rgba(110,74,47,0.08)]"
                      : "border-[var(--color-border)] bg-[rgba(255,249,244,0.40)] text-[var(--color-copy)]"
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {selectedDay.slots.map((slot) => (
                <button
                  key={slot}
                  data-step-animate
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    "rounded-[24px] border px-4 py-5 text-sm font-semibold transition duration-300",
                    selectedSlot === slot
                      ? "border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.76)] text-[var(--color-ink)] shadow-[0_18px_40px_rgba(110,74,47,0.08)]"
                      : "border-[var(--color-border)] bg-[rgba(255,249,244,0.42)] text-[var(--color-copy)]"
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>

            <GlassCard data-step-animate className="p-5">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-1 h-5 w-5 text-[var(--color-accent-strong)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    La agenda se confirma después de revisar tu pago.
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    Mientras tanto, dejamos el horario como solicitud prioritaria para el
                    equipo administrativo.
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        );

      case 3:
        return (
          <div className="space-y-7">
            <div>
              <p
                data-step-animate
                className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
              >
                Datos del paciente
              </p>

              <h2
                data-step-animate
                className="font-display mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
              >
                Déjanos tus datos para terminar la solicitud sin hacerla pesada.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label data-step-animate className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-copy)]">
                  Nombre completo
                </span>
                <input
                  value={patientForm.fullName}
                  onChange={handleFieldChange("fullName")}
                  className="w-full rounded-[22px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[rgba(184,138,90,0.34)]"
                  placeholder="Escribe tu nombre"
                />
              </label>

              <label data-step-animate className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-copy)]">
                  WhatsApp
                </span>
                <input
                  value={patientForm.whatsapp}
                  onChange={handleFieldChange("whatsapp")}
                  className="w-full rounded-[22px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[rgba(184,138,90,0.34)]"
                  placeholder="+591 ..."
                />
              </label>

              <label data-step-animate className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-copy)]">
                  Correo electronico
                </span>
                <input
                  value={patientForm.email}
                  onChange={handleFieldChange("email")}
                  className="w-full rounded-[22px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[rgba(184,138,90,0.34)]"
                  placeholder="Opcional"
                />
              </label>

              <label data-step-animate className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-[var(--color-copy)]">
                  Que deseas valorar
                </span>
                <textarea
                  rows={4}
                  value={patientForm.notes}
                  onChange={handleFieldChange("notes")}
                  className="w-full rounded-[24px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[rgba(184,138,90,0.34)]"
                  placeholder="Cuéntanos si buscas armonización, bienestar integral o si deseas aplicar una promoción específica."
                />
              </label>
            </div>

            {!detailsStepComplete && (
              <p
                data-step-animate
                className="text-sm leading-7 text-[var(--color-copy)]"
              >
                Para continuar solo necesitamos tu nombre y tu número de WhatsApp.
              </p>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-7">
            <div>
              <p
                data-step-animate
                className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
              >
                Pago y comprobante
              </p>

              <h2
                data-step-animate
                className="font-display mt-4 max-w-3xl text-4xl font-semibold leading-[0.95] text-[var(--color-ink)] md:text-5xl"
              >
                Último paso: paga al QR y sube tu comprobante.
              </h2>
            </div>

            <div data-step-animate className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <GlassCard className="p-6">
                <p className="text-sm text-[var(--color-copy)]">Monto a transferir</p>
                <p className="mt-3 text-4xl font-semibold text-[var(--color-chocolate)]">
                  {selectedService.amount}
                </p>
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Incluye revisión clínica inicial, criterio médico y reserva provisional del
                  espacio solicitado.
                </p>

                <div className="mt-6 rounded-[26px] bg-[rgba(255,249,244,0.72)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                        QR de pago
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-copy)]">
                        Aquí luego conectamos el QR real del consultorio.
                      </p>
                    </div>
                    <QrCode className="h-6 w-6 text-[var(--color-accent-strong)]" />
                  </div>

                  <div className="mt-5 flex items-center justify-center rounded-[24px] bg-[var(--color-surface)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                    <div className="grid grid-cols-7 gap-1 rounded-[16px] bg-[var(--color-surface)] p-3">
                      {qrPattern.flatMap((row, rowIndex) =>
                        row.split("").map((cell, cellIndex) => (
                          <span
                            key={`${rowIndex}-${cellIndex}`}
                            className={cn(
                              "h-4 w-4 rounded-[2px]",
                              cell === "1"
                                ? "bg-[var(--color-chocolate)]"
                                : "bg-[rgba(216,194,174,0.22)]"
                            )}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-[rgba(216,194,174,0.26)] p-3">
                    <UploadCloud className="h-5 w-5 text-[var(--color-mocha)]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                      Comprobante
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                      Sube el respaldo del pago
                    </p>
                  </div>
                </div>

                <label className="mt-6 block cursor-pointer rounded-[28px] border border-dashed border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.5)] p-6 text-center transition duration-500 hover:bg-[rgba(255,249,244,0.74)]">
                  <UploadCloud className="mx-auto h-8 w-8 text-[var(--color-accent-strong)]" />
                  <p className="mt-4 text-sm font-medium text-[var(--color-ink)]">
                    Haz clic para subir tu comprobante
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    Acepta imagen o PDF. El administrador comparará este archivo con el
                    pago antes de aceptar la cita.
                  </p>
                  <input type="file" className="hidden" onChange={handleFileChange} />
                </label>

                {uploadedFileName ? (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[rgba(216,194,174,0.28)] px-4 py-2 text-sm text-[var(--color-mocha)]">
                    <CheckCircle2 className="h-4 w-4" />
                    {uploadedFileName}
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
                    Una vez enviado, te confirmaremos por WhatsApp cuando el pago ya este
                    verificado y la cita haya sido aprobada en agenda.
                  </p>
                )}
              </GlassCard>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-base)_0%,#f6efe8_18%,var(--color-surface)_50%,var(--color-surface-soft)_100%)] text-[var(--color-ink)]">
      <section ref={shellRef} className="relative overflow-hidden px-4 pb-16 pt-6 sm:px-6 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(198,162,123,0.15),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(183,156,132,0.20),transparent_20%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] px-4 py-2 text-sm text-[var(--color-copy)] backdrop-blur-xl transition duration-300 hover:text-[var(--color-ink)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a la landing
            </Link>

            <div className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.48)] px-4 py-2 text-xs uppercase tracking-[0.28em] text-[var(--color-accent-strong)] backdrop-blur-xl md:inline-flex">
              <ShieldCheck className="h-4 w-4" />
              Pago con validación manual
            </div>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.52)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--color-accent-strong)] backdrop-blur-xl">
                <Sparkles className="h-4 w-4" />
                Agenda guiada
              </div>

              <h1 className="font-display mt-6 max-w-4xl text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-7xl">
                Agenda tu valoración en pasos cortos, fluidos y mucho más claros.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-copy)] md:text-lg">
                Reorganizamos la experiencia para que no se sienta pesada: eliges promo,
                tipo de valoración, horario, datos y al final haces el pago con QR antes
                de enviar la solicitud.
              </p>
            </div>

            <GlassCard className="relative overflow-hidden p-6 md:p-7">
              <div className="absolute inset-x-6 top-0 h-24 rounded-full bg-[radial-gradient(circle,rgba(255,249,244,0.65),transparent_68%)] blur-2xl" />

              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                      Flujo nuevo
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">
                      Una sola vista que cambia contigo
                    </h2>
                  </div>
                  <CreditCard className="h-6 w-6 text-[var(--color-accent-strong)]" />
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-start gap-3 rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                    <BadgePercent className="mt-0.5 h-5 w-5 text-[var(--color-accent-strong)]" />
                    <p className="text-sm leading-7 text-[var(--color-copy)]">
                      Primero te damos un gancho suave con promociones activas, sin
                      obligarte a salir del flujo.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                    <CalendarDays className="mt-0.5 h-5 w-5 text-[var(--color-accent-strong)]" />
                    <p className="text-sm leading-7 text-[var(--color-copy)]">
                      Luego eliges valoración y horario antes de llenar tus datos, para
                      que el proceso se sienta más natural.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                    <MessageCircleMore className="mt-0.5 h-5 w-5 text-[var(--color-accent-strong)]" />
                    <p className="text-sm leading-7 text-[var(--color-copy)]">
                      Al final pagas, subes el comprobante y nosotros confirmamos por
                      WhatsApp una vez validado.
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="mt-10 rounded-[36px] border border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.58)] p-4 shadow-[0_30px_90px_rgba(110,74,47,0.12)] backdrop-blur-[22px] md:p-5">
            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <GlassCard className="overflow-hidden p-6 md:p-8">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-5 border-b border-[rgba(184,138,90,0.10)] pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                          {submitted ? "Confirmado" : currentStepMeta.eyebrow}
                        </p>
                        <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)] md:text-3xl">
                          {submitted ? "Tu solicitud fue enviada" : currentStepMeta.label}
                        </h2>
                      </div>

                      {!submitted && !isSubmitting && (
                        <div className="rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.60)] px-4 py-2 text-sm text-[var(--color-copy)]">
                          Paso {currentStep + 1} de {steps.length}
                        </div>
                      )}
                    </div>

                      {!submitted && !isSubmitting && (
                      <>
                        <p className="max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
                          {currentStepMeta.description}
                        </p>

                        <div className="h-2 overflow-hidden rounded-full bg-[rgba(216,194,174,0.20)]">
                          <span
                            ref={progressFillRef}
                            className="block h-full w-0 rounded-full bg-[linear-gradient(90deg,var(--color-accent-strong),var(--color-caramel))]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {steps.map((step, index) => {
                            const isDone = index < currentStep;
                            const isActive = index === currentStep;

                            return (
                              <div
                                key={step.id}
                                className={cn(
                                  "rounded-[20px] border px-3 py-3 text-center text-[11px] uppercase tracking-[0.18em] transition duration-300",
                                  isActive
                                    ? "border-[rgba(184,138,90,0.34)] bg-[rgba(255,249,244,0.74)] text-[var(--color-ink)]"
                                    : isDone
                                      ? "border-[rgba(184,138,90,0.22)] bg-[rgba(216,194,174,0.18)] text-[var(--color-mocha)]"
                                      : "border-[var(--color-border)] bg-[rgba(255,249,244,0.40)] text-[var(--color-copy)]"
                                )}
                              >
                                {step.label}
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid gap-3 xl:hidden">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                              <p className="text-sm text-[var(--color-copy)]">Valoración</p>
                              <p className="mt-2 text-base font-semibold text-[var(--color-ink)]">
                                {selectedService.name}
                              </p>
                            </div>

                            <div className="rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                              <p className="text-sm text-[var(--color-copy)]">Monto</p>
                              <p className="mt-2 text-base font-semibold text-[var(--color-ink)]">
                                {selectedService.amount}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                              <p className="text-sm text-[var(--color-copy)]">Promo</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                                {selectedPromo?.title ?? "Sin promo"}
                              </p>
                            </div>

                            <div className="rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                              <p className="text-sm text-[var(--color-copy)]">Fecha</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                                {selectedDay.label}
                              </p>
                            </div>

                            <div className="rounded-[22px] bg-[rgba(255,249,244,0.56)] p-4">
                              <p className="text-sm text-[var(--color-copy)]">Hora</p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
                                {selectedSlot}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <form onSubmit={handleSubmit}>
                    <div ref={stageRef}>{renderStepContent()}</div>

                    {!submitted && !isSubmitting && (
                      <div className="mt-8 flex flex-col gap-3 border-t border-[rgba(184,138,90,0.10)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={handleBack}
                          disabled={currentStep === 0}
                          className={cn(
                            "inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition duration-300",
                            currentStep === 0
                              ? "cursor-not-allowed border-[var(--color-border)] bg-[rgba(255,249,244,0.34)] text-[rgba(111,90,76,0.55)]"
                              : "border-[var(--color-border)] bg-[rgba(255,249,244,0.56)] text-[var(--color-ink)] hover:-translate-y-0.5 hover:bg-[rgba(255,249,244,0.78)]"
                          )}
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Atras
                        </button>

                        {currentStep < steps.length - 1 ? (
                          <button
                            type="button"
                            onClick={handleNext}
                            disabled={!canContinue}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition duration-500",
                              canContinue
                                ? "border border-[rgba(184,138,90,0.30)] bg-[var(--color-caramel)] text-[var(--color-surface)] shadow-[0_18px_40px_rgba(110,74,47,0.18)] hover:-translate-y-1 hover:bg-[var(--color-mocha)]"
                                : "cursor-not-allowed border border-[rgba(184,138,90,0.16)] bg-[rgba(154,107,67,0.45)] text-[rgba(255,249,244,0.86)]"
                            )}
                          >
                            Continuar
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={!canContinue}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition duration-500",
                              canContinue
                                ? "border border-[rgba(184,138,90,0.30)] bg-[var(--color-caramel)] text-[var(--color-surface)] shadow-[0_18px_40px_rgba(110,74,47,0.18)] hover:-translate-y-1 hover:bg-[var(--color-mocha)]"
                                : "cursor-not-allowed border border-[rgba(184,138,90,0.16)] bg-[rgba(154,107,67,0.45)] text-[rgba(255,249,244,0.86)]"
                            )}
                          >
                            Enviar solicitud
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </form>
                </div>
              </GlassCard>

              <div className="hidden space-y-5 xl:block">
                <div className="xl:sticky xl:top-24">
                  <GlassCard className="p-6 md:p-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                      Resumen en tiempo real
                    </p>

                    <h3 className="mt-4 text-2xl font-semibold text-[var(--color-ink)]">
                      Todo lo importante, sin perder el contexto.
                    </h3>

                    <div className="mt-6 space-y-4">
                      <div className="rounded-[24px] bg-[rgba(255,249,244,0.56)] p-5">
                        <p className="text-sm text-[var(--color-copy)]">Promoción</p>
                        <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                          {selectedPromo?.title ?? "Sin promoción asociada"}
                        </p>
                      </div>

                      <div className="rounded-[24px] bg-[rgba(255,249,244,0.56)] p-5">
                        <p className="text-sm text-[var(--color-copy)]">Valoración</p>
                        <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                          {selectedService.name}
                        </p>
                        <p className="mt-2 text-sm text-[var(--color-copy)]">
                          {selectedService.duration}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-[24px] bg-[rgba(255,249,244,0.56)] p-5">
                          <p className="text-sm text-[var(--color-copy)]">Fecha</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                            {selectedDay.label}
                          </p>
                        </div>

                        <div className="rounded-[24px] bg-[rgba(255,249,244,0.56)] p-5">
                          <p className="text-sm text-[var(--color-copy)]">Horario</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--color-ink)]">
                            {selectedSlot}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(216,194,174,0.18),rgba(255,249,244,0.56))] p-5">
                        <p className="text-sm text-[var(--color-copy)]">Monto final</p>
                        <p className="mt-2 text-3xl font-semibold text-[var(--color-chocolate)]">
                          {selectedService.amount}
                        </p>
                        <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                          El horario se confirma cuando el pago sea verificado y aceptado por el equipo.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="mt-5 p-6 md:p-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
                      Lo que sigue
                    </p>

                    <div className="mt-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(216,194,174,0.22)] text-sm font-semibold text-[var(--color-ink)]">
                          1
                        </div>
                        <p className="text-sm leading-7 text-[var(--color-copy)]">
                          Envia tu solicitud con el comprobante ya cargado.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(216,194,174,0.22)] text-sm font-semibold text-[var(--color-ink)]">
                          2
                        </div>
                        <p className="text-sm leading-7 text-[var(--color-copy)]">
                          El administrador compara pago, monto y horario solicitado.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(216,194,174,0.22)] text-sm font-semibold text-[var(--color-ink)]">
                          3
                        </div>
                        <p className="text-sm leading-7 text-[var(--color-copy)]">
                          Si todo esta correcto, la agenda se confirma y te avisamos por WhatsApp.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
