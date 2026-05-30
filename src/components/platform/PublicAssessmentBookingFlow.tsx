import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CalendarDays, CheckCircle2, CreditCard, FileUp, MapPin, UserRound } from "lucide-react";

import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import {
  getAllowedReservationModes,
  getCareModeLabel,
  normalizeAvailabilityCareMode,
  normalizeReservationCareMode,
  type AvailabilityCareMode,
  type ReservationCareMode,
} from "../../lib/careMode";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { getDoctors, type DoctorProfileRow } from "../../services/doctorService";
import {
  createPublicAssessmentReservation,
  uploadPublicAssessmentReceipt,
} from "../../services/reservationService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { normalizeDocumentNumber } from "../../utils/documentNumber";
import { formatDate, formatMoney } from "../../utils/text";

type AssessmentContext = {
  type: "general" | "promotion" | "treatment";
  id?: string | null;
  title: string;
  city?: string | null;
  doctor_id?: string | null;
  agenda_tag?: string | null;
  appointment_type?: string | null;
  assessment_mode?: AvailabilityCareMode | null;
  assessment_price?: number | null;
  assessment_price_presencial?: number | null;
  assessment_price_virtual?: number | null;
};

type FlowStep = "datos" | "horario" | "pago";

export function PublicAssessmentBookingFlow({
  mode,
  open = true,
  onClose,
  onSuccess,
  context,
  allowDoctorSelection = false,
  allowAppointmentTypeSelection = false,
  appointmentTypeOptions = [],
}: {
  mode: "page" | "modal";
  open?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  context: AssessmentContext;
  allowDoctorSelection?: boolean;
  allowAppointmentTypeSelection?: boolean;
  appointmentTypeOptions?: string[];
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<FlowStep>("datos");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reservationReference, setReservationReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(context.doctor_id ?? "");
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [selectedCareMode, setSelectedCareMode] = useState<ReservationCareMode>("presencial");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    city: "",
    document_number: "",
    notes: "",
  });

  useEffect(() => {
    getSiteSettings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setLoadingSettings(false));
  }, []);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? user?.user_metadata.full_name ?? "",
      phone: profile?.phone ?? user?.user_metadata.phone ?? "",
      city: profile?.city ?? context.city ?? "Cochabamba",
      document_number: profile?.document_number ?? user?.user_metadata.document_number ?? "",
      notes: "",
    });
  }, [context.city, profile, user]);

  const assessmentTitle = settings?.assessment_label?.trim() || "Valoracion estetica";
  const defaultAppointmentType =
    context.appointment_type?.trim() || settings?.assessment_appointment_type?.trim() || "Valoracion estetica";
  const defaultAvailabilityCareMode = normalizeAvailabilityCareMode(context.assessment_mode ?? "ambas");
  const allowedCareModes = useMemo(
    () => getAllowedReservationModes(defaultAvailabilityCareMode),
    [defaultAvailabilityCareMode]
  );
  const defaultCareMode = allowedCareModes[0] ?? "presencial";
  const resolvedCareMode = allowedCareModes.includes(selectedCareMode)
    ? selectedCareMode
    : normalizeReservationCareMode(defaultCareMode);
  const allowCareModeSelection = allowedCareModes.length > 1;
  const assessmentPriceByMode: Record<ReservationCareMode, number> = {
    presencial: Number(context.assessment_price_presencial ?? context.assessment_price ?? settings?.assessment_price ?? 0),
    virtual: Number(context.assessment_price_virtual ?? context.assessment_price ?? settings?.assessment_price ?? 0),
  };
  const assessmentPrice = assessmentPriceByMode[resolvedCareMode];
  const careModePrices = allowedCareModes.map((careMode) => assessmentPriceByMode[careMode]);
  const minAssessmentPrice = Math.min(...careModePrices);
  const maxAssessmentPrice = Math.max(...careModePrices);
  const paymentQrImage = settings?.payment_qr_image ?? settings?.appointment_qr_payment_image ?? null;
  const normalizedAppointmentTypeOptions = useMemo(() => {
    const baseOptions = appointmentTypeOptions.length > 0 ? appointmentTypeOptions : [defaultAppointmentType];
    return [...new Set(baseOptions.map((item) => item.trim()).filter(Boolean))];
  }, [appointmentTypeOptions, defaultAppointmentType]);
  const resolvedAppointmentType = allowAppointmentTypeSelection
    ? selectedAppointmentType || normalizedAppointmentTypeOptions[0] || defaultAppointmentType
    : defaultAppointmentType;
  const resolvedDoctorId = allowDoctorSelection ? selectedDoctorId || null : context.doctor_id ?? null;
  const resolvedAssessmentLabel = allowAppointmentTypeSelection ? resolvedAppointmentType : assessmentTitle;
  const headingTitle = allowAppointmentTypeSelection ? "Reserva tu cita" : assessmentTitle;
  const doctorNameMap = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.full_name])),
    [doctors]
  );
  const selectedDoctorName = resolvedDoctorId ? doctorNameMap.get(resolvedDoctorId) ?? "Doctora seleccionada" : null;

  useEffect(() => {
    if (!allowDoctorSelection) {
      setDoctors([]);
      setSelectedDoctorId(context.doctor_id ?? "");
      return;
    }

    setLoadingDoctors(true);
    getDoctors()
      .then((rows) => {
        setDoctors(rows);
        setSelectedDoctorId((current) => {
          if (current && rows.some((doctor) => doctor.id === current)) return current;
          if (context.doctor_id && rows.some((doctor) => doctor.id === context.doctor_id)) return context.doctor_id;
          return "";
        });
      })
      .catch(() => setDoctors([]))
      .finally(() => setLoadingDoctors(false));
  }, [allowDoctorSelection, context.doctor_id]);

  useEffect(() => {
    if (!allowAppointmentTypeSelection) {
      setSelectedAppointmentType("");
      return;
    }

    setSelectedAppointmentType((current) => {
      if (current && normalizedAppointmentTypeOptions.includes(current)) return current;
      return normalizedAppointmentTypeOptions[0] ?? defaultAppointmentType;
    });
  }, [allowAppointmentTypeSelection, defaultAppointmentType, normalizedAppointmentTypeOptions]);

  useEffect(() => {
    setSelectedCareMode((current) => {
      if (allowedCareModes.includes(current)) return current;
      return normalizeReservationCareMode(defaultCareMode);
    });
  }, [allowedCareModes, defaultCareMode]);

  useEffect(() => {
    const city = form.city.trim();
    if (!city || !open || !resolvedAppointmentType.trim()) {
      setSlots([]);
      setSelectedDate(null);
      setSelectedSlot(null);
      return;
    }
    if (step === "datos") return;

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 45);

    setLoadingSlots(true);
    setErrorMessage("");

    const filters = {
      city,
      appointment_type: resolvedAppointmentType,
      care_mode: resolvedCareMode,
      agenda_tag: context.agenda_tag ?? null,
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    };
    const allowDoctorFallback = Boolean(context.doctor_id && !allowDoctorSelection);

    getAvailableSlots({
      ...filters,
      doctor_id: resolvedDoctorId,
    })
      .then((rows) => {
        if (rows.length > 0 || !allowDoctorFallback) return rows;
        return getAvailableSlots(filters);
      })
      .then((rows) => {
        setSlots(rows);
        setSelectedDate((current) => {
          if (current && rows.some((slot) => slot.date === current)) return current;
          return rows[0]?.date ?? null;
        });
        setSelectedSlot((current) =>
          current && rows.some((slot) => getSlotKey(slot) === getSlotKey(current)) ? current : null
        );
      })
      .catch((error) => {
        setSlots([]);
        setSelectedDate(null);
        setSelectedSlot(null);
        setErrorMessage(error instanceof Error ? error.message : "No pudimos cargar horarios.");
      })
      .finally(() => setLoadingSlots(false));
  }, [allowDoctorSelection, context.agenda_tag, context.doctor_id, form.city, open, resolvedAppointmentType, resolvedCareMode, resolvedDoctorId, step]);

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, AvailableSlot[]>();

    slots.forEach((slot) => {
      groups.set(slot.date, [...(groups.get(slot.date) ?? []), slot]);
    });

    return Array.from(groups.entries()).map(([date, items]) => ({
      date,
      slots: items.sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }));
  }, [slots]);

  const visibleSlots = groupedSlots.find((group) => group.date === selectedDate)?.slots ?? [];
  const dataStepComplete =
    form.full_name.trim().length >= 3 &&
    form.phone.trim().length >= 7 &&
    form.city.trim().length >= 2 &&
    normalizeDocumentNumber(form.document_number).length >= 5 &&
    resolvedAppointmentType.trim().length >= 2;
  const canSubmit = dataStepComplete && Boolean(selectedSlot) && Boolean(receiptFile) && Boolean(paymentQrImage);

  useEffect(() => {
    if (mode === "modal" && !open) {
      setStep("datos");
      setSuccessMessage("");
      setErrorMessage("");
      setReservationReference("");
      setReceiptFile(null);
      setSelectedSlot(null);
      setSelectedDate(null);
    }
  }, [mode, open]);

  if (mode === "modal" && !open) return null;

  const goToSchedule = () => {
    if (!dataStepComplete) {
      setErrorMessage("Completa nombre, celular, ciudad y carnet antes de elegir horario.");
      return;
    }
    setErrorMessage("");
    setStep("horario");
  };

  const goToPayment = () => {
    if (!selectedSlot) {
      setErrorMessage("Elige un horario disponible antes de continuar al pago.");
      return;
    }
    setErrorMessage("");
    setStep("pago");
  };

  const submit = async () => {
    if (!selectedSlot || !receiptFile) {
      setErrorMessage("Te falta elegir horario o subir el comprobante.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const payment_receipt_path = await uploadPublicAssessmentReceipt(receiptFile);

      const reservation = await createPublicAssessmentReservation({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: user?.email ?? profile?.email ?? null,
        city: form.city.trim(),
        document_number: normalizeDocumentNumber(form.document_number),
        appointment_type: resolvedAppointmentType,
        care_mode: resolvedCareMode,
        assessment_label: resolvedAssessmentLabel,
        payment_receipt_path,
        payment_amount: assessmentPrice,
        slot: {
          rule_id: selectedSlot.rule_id,
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          city: selectedSlot.city,
        },
        source:
          context.type === "promotion"
            ? "assessment_promotion"
            : context.type === "treatment"
              ? "assessment_treatment"
              : "assessment_public",
        notes: form.notes.trim() || null,
        context_type: context.type,
        context_title: context.title,
        context_reference_id: context.id ?? null,
      });

      if (user) {
        await refreshProfile().catch(() => undefined);
      }

      setReservationReference(formatReservationReference(reservation.id));
      setSuccessMessage(
        "Gracias por reservar tu horario. Te mandaremos un mensaje a tu WhatsApp cuando quede confirmado todo."
      );
      setReceiptFile(null);
      onSuccess?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No pudimos registrar tu cita.");
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <div className={mode === "page" ? "rounded-[32px] border border-[var(--color-border)] bg-white/75 p-4 shadow-[0_24px_80px_rgba(62,42,31,0.08)] sm:p-6 md:p-8" : ""}>
      {successMessage && reservationReference ? (
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[rgba(189,152,119,0.18)] blur-3xl" />
            <div className="relative rounded-[32px] border border-[rgba(189,152,119,0.28)] bg-[rgba(255,249,244,0.94)] px-8 py-10 shadow-[0_24px_70px_rgba(62,42,31,0.12)]">
              <img
                src="/doctora/logodra.svg"
                alt="Logo Dra. Estefany"
                className="mx-auto h-20 w-20 animate-[pulse_2.2s_ease-in-out_infinite] object-contain"
              />
              <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(111,122,96,0.14)] text-[rgb(78,107,84)]">
                <CheckCircle2 className="h-9 w-9 animate-[scale-in_280ms_ease-out]" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                Solicitud enviada
              </p>
              <h3 className="font-display mt-3 text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
                Gracias por reservar tu horario
              </h3>
              <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] sm:text-base">
                {successMessage}
              </p>
              <div className="mt-6 rounded-[22px] bg-white/80 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  Codigo de reserva
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[0.12em] text-[var(--color-ink)]">
                  {reservationReference}
                </p>
              </div>
              <p className="mt-5 text-xs leading-6 text-[var(--color-copy)]">
                Guarda este codigo por si necesitas consultarnos el estado de la cita.
              </p>
              {mode === "modal" ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 rounded-full border border-[var(--color-border)] bg-white/82 px-6 py-3 text-sm font-semibold text-[var(--color-ink)]"
                >
                  Cerrar confirmacion
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            {allowAppointmentTypeSelection ? "Reserva privada" : "Valoracion"}
          </p>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-[0.95] sm:text-5xl">
            {headingTitle}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
            {context.title}. Elige tus datos, define para que cita quieres agendarte, revisa la disponibilidad real y sube tu comprobante con CI obligatorio.
          </p>
        </div>
        <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
            Pago actual
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-copy)]">
            {allowCareModeSelection && step === "datos" ? "Segun modalidad" : getCareModeLabel(resolvedCareMode)}
          </p>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">
            {allowCareModeSelection && step === "datos"
              ? minAssessmentPrice === maxAssessmentPrice
                ? formatMoney(minAssessmentPrice)
                : `${formatMoney(minAssessmentPrice)} - ${formatMoney(maxAssessmentPrice)}`
              : formatMoney(assessmentPrice)}
          </p>
        </div>
      </div>

      <FlowSteps current={step} />

      {errorMessage ? <StatusBox tone="error" className="mt-6" message={errorMessage} /> : null}

      <div className="mt-8 grid gap-6">
        {step === "datos" ? (
          <div className="rounded-[28px] border border-[var(--color-mocha)] bg-[rgba(255,249,244,0.92)] p-5">
            <StepHeader icon={<UserRound className="h-4 w-4" />} title="Paso 1: tus datos" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo">
                <input
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                  className="premium-input"
                />
              </Field>
              <Field label="Celular">
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="premium-input"
                />
              </Field>
              <Field label="Ciudad">
                <select
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
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
              {allowAppointmentTypeSelection ? (
                <Field label="Tipo de cita">
                  <select
                    value={resolvedAppointmentType}
                    onChange={(event) => setSelectedAppointmentType(event.target.value)}
                    className="premium-input"
                  >
                    {normalizedAppointmentTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {allowDoctorSelection ? (
                <Field label="Doctora">
                  <select
                    value={selectedDoctorId}
                    onChange={(event) => setSelectedDoctorId(event.target.value)}
                    className="premium-input"
                    disabled={loadingDoctors}
                  >
                    <option value="">
                      {loadingDoctors ? "Cargando doctoras..." : "Cualquier doctora disponible"}
                    </option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Carnet de identidad / CI">
                <input
                  value={form.document_number}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      document_number: normalizeDocumentNumber(event.target.value),
                    }))
                  }
                  className="premium-input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notas opcionales">
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="premium-input min-h-28"
                    placeholder="Si quieres, cuentanos que te interesa revisar en la cita."
                  />
                </Field>
              </div>
            </div>
          </div>
        ) : null}

        {step === "horario" ? (
          <div className="rounded-[28px] border border-[var(--color-mocha)] bg-[rgba(255,249,244,0.92)] p-5">
            <StepHeader icon={<CalendarDays className="h-4 w-4" />} title="Paso 2: elige horario" />
            {allowCareModeSelection ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                <Field label="Modalidad de la valoracion">
                  <select
                    value={resolvedCareMode}
                    onChange={(event) => {
                      setSelectedCareMode(normalizeReservationCareMode(event.target.value, defaultCareMode));
                      setSelectedSlot(null);
                      setSelectedDate(null);
                    }}
                    className="premium-input"
                  >
                    {allowedCareModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {getCareModeLabel(mode)}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-[22px] border border-[var(--color-border)] bg-white/82 px-4 py-3 text-sm leading-6 text-[var(--color-copy)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                    Precio segun modalidad
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                    {formatMoney(assessmentPrice)}
                  </p>
                  <p className="mt-1">
                    Estas viendo horarios para {getCareModeLabel(resolvedCareMode).toLowerCase()}.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded-[22px] bg-[rgba(247,242,236,0.76)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              <p className="font-semibold text-[var(--color-ink)]">{form.full_name}</p>
              <p>
                CI: {normalizeDocumentNumber(form.document_number)}
                <br />
                Ciudad: {form.city}
                <br />
                Modalidad: {getCareModeLabel(resolvedCareMode)}
                <br />
                Tipo de cita: {resolvedAppointmentType}
                <br />
                Doctora: {selectedDoctorName ?? "Cualquier doctora disponible"}
              </p>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Te mostramos la disponibilidad real para {resolvedAppointmentType.toLowerCase()} en modalidad {getCareModeLabel(resolvedCareMode).toLowerCase()} en {form.city || "tu ciudad"}
              {selectedDoctorName ? ` con ${selectedDoctorName}.` : "."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {groupedSlots.map((group) => (
                <button
                  key={group.date}
                  type="button"
                  onClick={() => setSelectedDate(group.date)}
                  className={`rounded-[18px] border px-3 py-3 text-center text-xs font-semibold leading-5 sm:px-4 sm:text-sm ${
                    selectedDate === group.date
                      ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                      : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                  }`}
                >
                  {formatDate(group.date)}
                </button>
              ))}
            </div>
            <div className="mt-4 grid max-h-[26rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
              {loadingSlots ? (
                <p className="text-sm text-[var(--color-copy)]">Buscando horarios disponibles...</p>
              ) : null}
              {!loadingSettings && !loadingSlots && groupedSlots.length === 0 ? (
                <p className="text-sm leading-7 text-[var(--color-copy)]">
                  Aun no encontramos horarios activos para esta cita. Revisa ciudad, doctora, tipo de cita o configuracion de agenda.
                </p>
              ) : null}
              {visibleSlots.map((slot) => {
                const selected = selectedSlot && getSlotKey(selectedSlot) === getSlotKey(slot);
                const slotDoctorName = slot.doctor_id ? doctorNameMap.get(slot.doctor_id) : null;

                return (
                  <button
                    key={getSlotKey(slot)}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`min-h-[120px] rounded-[20px] border p-4 text-left transition sm:min-h-[132px] ${
                      selected
                        ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                        : "border-[var(--color-border)] bg-white/82 text-[var(--color-ink)]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{formatDate(slot.date)}</span>
                    <span className="mt-1 block text-base font-semibold">
                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-xs opacity-80">
                      <MapPin className="h-3.5 w-3.5" />
                      {slot.location ?? slot.city}
                    </span>
                    {slotDoctorName ? (
                      <span className="mt-2 block text-xs opacity-80">
                        Doctora: {slotDoctorName}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs opacity-80">
                      Modalidad: {getCareModeLabel(slot.care_mode)}
                    </span>
                    <span className="mt-2 block text-xs opacity-80">
                      {slot.available_capacity} cupo(s) disponibles
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "pago" ? (
          <div className="rounded-[28px] border border-[var(--color-mocha)] bg-[rgba(255,249,244,0.92)] p-5">
          <StepHeader icon={<CreditCard className="h-4 w-4" />} title="Paso 3: paga y sube comprobante" />
          <div className="mt-4 rounded-[22px] bg-[rgba(247,242,236,0.76)] p-4 text-sm leading-7 text-[var(--color-copy)]">
            <p className="font-semibold text-[var(--color-ink)]">{form.full_name || "Paciente pendiente"}</p>
            <p className="mt-2">
              CI: {normalizeDocumentNumber(form.document_number) || "Sin CI"}
              <br />
              Ciudad: {form.city || "Sin ciudad"}
              <br />
              Modalidad: {getCareModeLabel(resolvedCareMode)}
              <br />
              Tipo de cita: {resolvedAppointmentType}
              <br />
              Doctora: {selectedDoctorName ?? "Cualquier doctora disponible"}
            </p>
            {selectedSlot ? (
              <p className="mt-3">
                Horario elegido: {formatDate(selectedSlot.date)} - {selectedSlot.start_time.slice(0, 5)} - {selectedSlot.end_time.slice(0, 5)}
                {selectedSlot.doctor_id && doctorNameMap.get(selectedSlot.doctor_id)
                  ? ` con ${doctorNameMap.get(selectedSlot.doctor_id)}`
                  : ""}
              </p>
            ) : (
              <p className="mt-3">Aun no elegiste horario.</p>
            )}
          </div>

          {paymentQrImage ? (
            <div className="mt-5 rounded-[24px] bg-white/72 p-4">
              <img
                src={paymentQrImage}
                alt="QR para pagar cita"
                className="mx-auto h-48 w-48 rounded-[22px] object-contain sm:h-56 sm:w-56"
              />
              <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                Escanea el QR preconfigurado, paga {formatMoney(assessmentPrice)} para tu valoracion {getCareModeLabel(resolvedCareMode).toLowerCase()} y luego sube tu comprobante para cerrar la solicitud.
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-[var(--color-copy)]">
              Falta configurar el QR general de pagos en panel. Sin eso no podremos recibir la cita con comprobante.
            </p>
          )}

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
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => setStep("horario")}
              className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
            >
              Volver al horario
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || submitting}
              className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Enviando cita..." : "Enviar cita y pago"}
            </button>
          </div>
        </div>
        ) : null}

        {step === "datos" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={goToSchedule}
              className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
            >
              Continuar a horario
            </button>
          </div>
        ) : null}

        {step === "horario" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => setStep("datos")}
              className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
            >
              Volver a datos
            </button>
            <button
              type="button"
              onClick={goToPayment}
              className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
            >
              Continuar al pago
            </button>
          </div>
        ) : null}
      </div>
        </>
      )}
    </div>
  );

  if (mode === "page") {
    return content;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(43,33,27,0.44)] p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-[var(--color-surface)] p-4 shadow-[0_30px_90px_rgba(43,33,27,0.25)] sm:max-h-[92vh] sm:p-6 md:p-8">
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] bg-white/82 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
          >
            Cerrar
          </button>
        </div>
        {content}
      </div>
    </div>,
    document.body
  );
}

function FlowSteps({ current }: { current: FlowStep }) {
  const steps: { id: FlowStep; label: string }[] = [
    { id: "datos", label: "Datos" },
    { id: "horario", label: "Horario" },
    { id: "pago", label: "Pago" },
  ];
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <div className="mt-6 grid gap-2 md:grid-cols-3">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`rounded-[18px] border px-4 py-3 text-sm font-semibold ${
            step.id === current
              ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
              : index < currentIndex
                ? "border-[rgba(111,122,96,0.24)] bg-[rgba(111,122,96,0.12)] text-[var(--color-ink)]"
                : "border-[var(--color-border)] bg-white/75 text-[var(--color-copy)]"
          }`}
        >
          Paso {index + 1}: {step.label}
        </div>
      ))}
    </div>
  );
}

function StepHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(111,92,75,0.10)] text-[var(--color-mocha)]">
        {icon}
      </span>
      <p className="text-base font-semibold text-[var(--color-ink)]">{title}</p>
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
      {tone === "success" ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : null}
      {message}
    </div>
  );
}

function getSlotKey(slot: AvailableSlot) {
  return `${slot.rule_id}-${slot.date}-${slot.start_time}-${slot.end_time}`;
}

function formatReservationReference(id?: string | null) {
  if (!id) return "VAL-SIN-CODIGO";
  return `VAL-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
