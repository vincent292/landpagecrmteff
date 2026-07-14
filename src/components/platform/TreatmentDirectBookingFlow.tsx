import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { updateMyProfile } from "../../services/profileService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import {
  attachTreatmentOrderReceipt,
  getMyTreatmentOrders,
  getTreatmentOrderReceiptUrl,
  saveTreatmentOrder,
  uploadTreatmentOrderReceipt,
  type TreatmentOrderRow,
} from "../../services/treatmentOrderService";
import {
  getTreatmentOrderPrice,
  getTreatmentRemainingSlots,
  hasTreatmentSlotLimit,
  type TreatmentRow,
} from "../../services/treatmentService";
import { formatDate, formatMoney } from "../../utils/text";

type FlashMessage = {
  tone: "success" | "error";
  text: string;
};

type PaymentChoice = "total" | "anticipo";
type OrderStep = "datos" | "horario" | "pago";

const defaultTreatmentAppointmentType = "Procedimiento";

function usesAppointmentSlots(agendaMode?: string | null) {
  return agendaMode !== "none";
}

export function TreatmentDirectBookingFlow({
  onClose,
  open,
  treatment,
}: {
  onClose: () => void;
  open: boolean;
  treatment: TreatmentRow;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [orders, setOrders] = useState<TreatmentOrderRow[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("total");
  const [savingOrder, setSavingOrder] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [appointmentSlots, setAppointmentSlots] = useState<AvailableSlot[]>([]);
  const [loadingAppointmentSlots, setLoadingAppointmentSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<string | null>(null);
  const [orderStep, setOrderStep] = useState<OrderStep>("datos");
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    document_number: "",
    notes: "",
    wants_appointment: true,
  });

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    getMyTreatmentOrders(user.id).then(setOrders).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? user?.user_metadata.full_name ?? "",
      email: profile?.email ?? user?.email ?? "",
      phone: profile?.phone ?? user?.user_metadata.phone ?? "",
      city: profile?.city ?? user?.user_metadata.city ?? "",
      document_number: profile?.document_number ?? user?.user_metadata.document_number ?? "",
      notes: "",
      wants_appointment: true,
    });
  }, [profile, user]);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setOrderStep("datos");
    setPaymentChoice("total");
  }, [open, treatment.id]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const slotCity = form.city.trim() || treatment.city?.trim() || "";
    if (!open || !form.wants_appointment || !slotCity || !usesAppointmentSlots(treatment.agenda_mode)) {
      setAppointmentSlots([]);
      setSelectedSlot(null);
      return;
    }

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 45);

    setLoadingAppointmentSlots(true);
    const filters = {
      city: slotCity,
      appointment_type: treatment.appointment_type || defaultTreatmentAppointmentType,
      agenda_tag: treatment.agenda_tag ?? null,
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    };

    getAvailableSlots({
      ...filters,
      doctor_id: treatment.doctor_id ?? null,
    })
      .then((rows) => {
        if (rows.length > 0 || !treatment.doctor_id) return rows;
        return getAvailableSlots(filters);
      })
      .then((rows) => {
        setAppointmentSlots(rows);
        setSelectedSlot((current) =>
          current && rows.some((slot) => getSlotKey(slot) === getSlotKey(current)) ? current : null
        );
      })
      .catch(() => {
        setAppointmentSlots([]);
        setSelectedSlot(null);
      })
      .finally(() => setLoadingAppointmentSlots(false));
  }, [form.city, form.wants_appointment, open, treatment]);

  const groupedAppointmentSlots = useMemo(() => {
    const grouped = new Map<string, AvailableSlot[]>();
    appointmentSlots.forEach((slot) => {
      grouped.set(slot.date, [...(grouped.get(slot.date) ?? []), slot]);
    });

    return Array.from(grouped.entries()).map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }));
  }, [appointmentSlots]);

  useEffect(() => {
    if (groupedAppointmentSlots.length === 0) {
      setSelectedSlotDate(null);
      return;
    }

    setSelectedSlotDate((current) => {
      if (selectedSlot?.date && groupedAppointmentSlots.some((group) => group.date === selectedSlot.date)) return selectedSlot.date;
      return current && groupedAppointmentSlots.some((group) => group.date === current)
        ? current
        : groupedAppointmentSlots[0].date;
    });
  }, [groupedAppointmentSlots, selectedSlot?.date]);

  const paymentQrImage = settings?.payment_qr_image ?? null;
  const latestOrder = useMemo(
    () => orders.find((order) => order.treatment_id === treatment.id) ?? null,
    [orders, treatment.id]
  );
  const totalAmount = getTreatmentOrderPrice(treatment);
  const remainingSlots = getTreatmentRemainingSlots(treatment);
  const hasSlotLimit = hasTreatmentSlotLimit(treatment);
  const hasAvailableTreatmentSlots = !hasSlotLimit || remainingSlots > 0;
  const canUsePartialPayment = Boolean(treatment.allows_partial_payment);
  const partialPercent = Number(treatment.partial_payment_percent ?? 50);
  const payableAmount = useMemo(() => {
    if (paymentChoice === "anticipo" && canUsePartialPayment) {
      return Number(((totalAmount * partialPercent) / 100).toFixed(2));
    }
    return Number(totalAmount.toFixed(2));
  }, [canUsePartialPayment, partialPercent, paymentChoice, totalAmount]);

  const shouldChooseSlot = Boolean(form.wants_appointment && usesAppointmentSlots(treatment.agenda_mode));
  const dataStepComplete =
    form.full_name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.document_number.trim().length > 0;
  const scheduleStepComplete = !shouldChooseSlot || Boolean(selectedSlot);
  const visibleAppointmentSlots = groupedAppointmentSlots.find((group) => group.date === selectedSlotDate)?.slots ?? [];
  const canSubmitOrder =
    dataStepComplete &&
    scheduleStepComplete &&
    hasAvailableTreatmentSlots &&
    totalAmount > 0 &&
    Boolean(paymentQrImage) &&
    Boolean(receiptFile);

  useEffect(() => {
    if (orderStep === "horario" && !shouldChooseSlot) {
      setOrderStep("pago");
    }
  }, [orderStep, shouldChooseSlot]);

  if (!open) return null;

  function setFlashMessage(tone: FlashMessage["tone"], text: string) {
    setMessage({ tone, text });
  }

  async function refreshOrders() {
    if (!user) return;
    const rows = await getMyTreatmentOrders(user.id);
    setOrders(rows);
  }

  async function submitOrder() {
    if (!hasAvailableTreatmentSlots) {
      setFlashMessage("error", "Este tratamiento ya no tiene cupos disponibles.");
      return;
    }
    if (totalAmount <= 0) {
      setFlashMessage("error", "Este tratamiento aun no tiene precio configurado para pago directo.");
      return;
    }
    if (!canSubmitOrder) {
      setFlashMessage("error", "Completa tus datos y sube el comprobante antes de enviar tu pedido.");
      return;
    }

    setSavingOrder(true);
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

      const order = await saveTreatmentOrder({
        treatment_id: treatment.id,
        user_id: user?.id ?? null,
        full_name: form.full_name,
        document_number: form.document_number,
        phone: form.phone,
        email: form.email,
        city: form.city,
        notes: form.notes,
        wants_appointment: form.wants_appointment,
        payment_mode: paymentChoice,
        payment_percent: paymentChoice === "anticipo" && canUsePartialPayment ? partialPercent : 100,
        total_amount: totalAmount,
        preferred_slot: form.wants_appointment && selectedSlot
          ? {
              rule_id: selectedSlot.rule_id,
              date: selectedSlot.date,
              start_time: selectedSlot.start_time,
              end_time: selectedSlot.end_time,
              city: selectedSlot.city,
              location: selectedSlot.location,
              appointment_type: selectedSlot.appointment_type,
              agenda_tag: selectedSlot.agenda_tag ?? treatment.agenda_tag ?? null,
            }
          : null,
      });

      if (receiptFile) {
        const path = await uploadTreatmentOrderReceipt(receiptFile, order.id);
        await attachTreatmentOrderReceipt(order.id, path);
      }

      const appointmentMessage =
        form.wants_appointment && shouldChooseSlot
          ? " Guardamos el horario elegido; se confirma cuando administracion apruebe el pago."
          : form.wants_appointment
            ? " Administracion coordinara tu horario cuando revise el pago."
            : "";

      await refreshOrders();
      setReceiptFile(null);
      setSelectedSlot(null);
      setFlashMessage("success", `Tu pedido de tratamiento fue enviado con comprobante. Administracion revisara el pago y lo pasara a caja al aprobar.${appointmentMessage}`);
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "";
      setFlashMessage("error", detail ? `No pudimos guardar tu pedido. ${detail}` : "No pudimos guardar tu pedido.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function openReceipt() {
    const url = await getTreatmentOrderReceiptUrl(latestOrder?.payment_receipt_path ?? null);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function goToScheduleStep() {
    if (!dataStepComplete) {
      setFlashMessage("error", "Completa tus datos antes de elegir horario.");
      return;
    }
    setMessage(null);
    setOrderStep("horario");
  }

  function goToPaymentStep() {
    if (!dataStepComplete) {
      setFlashMessage("error", "Completa tus datos antes de pagar.");
      setOrderStep("datos");
      return;
    }
    if (!scheduleStepComplete) {
      setFlashMessage("error", "Elige un horario disponible antes de continuar al pago.");
      setOrderStep("horario");
      return;
    }
    setMessage(null);
    setOrderStep("pago");
  }

  return createPortal(
    <ModalShell onClose={onClose} maxWidthClassName="max-w-5xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Pedido de tratamiento</p>
          <h2 className="font-display mt-3 max-w-4xl text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-[1.05]">Confirma tus datos, paga y sube tu comprobante</h2>
        </div>
        {latestOrder?.status ? (
          <span className="max-w-full self-start rounded-full bg-[rgba(216,194,174,0.26)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
            Ultimo pedido: {latestOrder.status}
          </span>
        ) : null}
      </div>

      {message ? (
        <div className={`mt-5 rounded-[20px] px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      ) : null}

      <OrderSteps current={orderStep} shouldChooseSlot={shouldChooseSlot} />

      <div className="mt-8 grid min-w-0 gap-6">
        <div className={orderStep === "pago" ? "hidden" : orderStep === "horario" ? "grid min-w-0 gap-4" : "grid min-w-0 gap-4 md:grid-cols-2"}>
          {orderStep === "datos" ? (
            <div className="md:col-span-2 rounded-[24px] bg-[rgba(247,242,236,0.82)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              Paso 1: confirma tus datos. No necesitas crear cuenta; estos datos se usan para validar el pago y coordinar tu cita.
            </div>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Nombre completo">
              <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} className="premium-input" />
            </Field>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Correo">
              <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="premium-input" />
            </Field>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Celular">
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="premium-input" />
            </Field>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Ciudad">
              <select value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Numero de carnet">
              <input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} className="premium-input" />
            </Field>
          ) : null}
          {orderStep === "datos" ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold">Quiero que luego coordinen mi cita</span>
              <input type="checkbox" checked={form.wants_appointment} onChange={(event) => setForm((current) => ({ ...current, wants_appointment: event.target.checked }))} className="mt-2 h-5 w-5" />
            </label>
          ) : null}
          {orderStep === "horario" && form.wants_appointment ? (
            <div className="min-w-0 rounded-[24px] border border-[var(--color-border)] bg-white/70 p-3 sm:p-4">
              <div className="grid min-w-0 gap-3 rounded-[20px] bg-[rgba(247,242,236,0.76)] p-4 text-sm text-[var(--color-copy)] sm:grid-cols-3">
                <SummaryBox label="Paciente" value={form.full_name || "Sin nombre"} />
                <SummaryBox label="Ciudad" value={form.city || treatment.city || "Sin ciudad"} />
                <SummaryBox label="Tratamiento" value={treatment.title} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[var(--color-ink)]">Paso 2: elige fecha y hora</p>
              <p className="mt-2 text-xs leading-5 text-[var(--color-copy)]">
                {shouldChooseSlot
                  ? `Mostramos horarios disponibles de tipo ${treatment.appointment_type || defaultTreatmentAppointmentType}. El horario se confirma cuando administracion apruebe el pago.`
                  : "Este tratamiento esta configurado para coordinar horario por WhatsApp despues de validar el pago."}
              </p>
              {shouldChooseSlot ? (
                <>
                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {groupedAppointmentSlots.map((group) => (
                      <button
                        key={group.date}
                        type="button"
                        onClick={() => setSelectedSlotDate(group.date)}
                        className={`min-w-0 rounded-[16px] border px-3 py-2 text-center text-xs font-semibold leading-5 transition sm:px-4 sm:text-sm ${
                          selectedSlotDate === group.date
                            ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                            : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                        }`}
                      >
                        <span className="block break-words">{formatDate(group.date)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid min-w-0 max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {loadingAppointmentSlots ? <p className="text-sm text-[var(--color-copy)]">Buscando horarios...</p> : null}
                    {!loadingAppointmentSlots && appointmentSlots.length === 0 ? (
                      <p className="text-sm leading-6 text-[var(--color-copy)]">
                        No hay horarios disponibles para {form.city.trim() || treatment.city || "tu ciudad"} por ahora. Revisa que la disponibilidad este activa y sea de tipo {treatment.appointment_type || defaultTreatmentAppointmentType}.
                      </p>
                    ) : null}
                    {visibleAppointmentSlots.map((slot) => {
                      const selected = selectedSlot && getSlotKey(selectedSlot) === getSlotKey(slot);

                      return (
                        <button
                          key={getSlotKey(slot)}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`min-h-[104px] min-w-0 w-full rounded-[18px] border px-4 py-4 text-left text-sm transition ${
                            selected
                              ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                              : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                          }`}
                        >
                          <span className="block text-sm font-semibold leading-5">{formatDate(slot.date)}</span>
                          <span className="mt-1 block text-xs leading-5 opacity-80">
                            {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)} - {slot.available_capacity} cupo(s)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {orderStep === "datos" ? (
            <Field label="Notas">
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="premium-input min-h-28" />
            </Field>
          ) : null}
          <div className="md:col-span-2 sticky bottom-0 z-10 mt-2 flex flex-col gap-3 rounded-[20px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.96)] p-3 backdrop-blur sm:static sm:flex-row sm:flex-wrap sm:justify-end sm:backdrop-blur-0">
            {orderStep === "datos" ? (
              <button type="button" onClick={shouldChooseSlot ? goToScheduleStep : goToPaymentStep} className="w-full whitespace-normal rounded-full bg-[var(--color-mocha)] px-6 py-3 text-center text-sm font-semibold leading-5 text-white sm:w-auto">
                {shouldChooseSlot ? "Continuar a horario" : "Continuar al pago"}
              </button>
            ) : null}
            {orderStep === "horario" ? (
              <>
                <button type="button" onClick={() => setOrderStep("datos")} className="w-full whitespace-normal rounded-full border border-[var(--color-border)] px-6 py-3 text-center text-sm font-semibold leading-5 sm:w-auto">
                  Volver a datos
                </button>
                <button type="button" onClick={goToPaymentStep} className="w-full whitespace-normal rounded-full bg-[var(--color-mocha)] px-6 py-3 text-center text-sm font-semibold leading-5 text-white sm:w-auto">
                  Continuar al pago
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className={orderStep === "pago" ? "min-w-0 w-full rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5 sm:p-6" : "hidden"}>
          <p className="text-sm font-semibold text-[var(--color-ink)]">Paso 3: revisa tu pedido y pago</p>
          <div className="mt-4 min-w-0 rounded-[18px] border border-[var(--color-border)] bg-white/80 p-3 text-sm">
            <p className="break-words font-semibold text-[var(--color-ink)]">{treatment.title}</p>
            <p className="mt-1 text-[var(--color-copy)]">
              {formatMoney(totalAmount)} - {hasSlotLimit ? `${remainingSlots} cupos disponibles` : "cupos segun agenda"}
            </p>
            {selectedSlot ? (
              <p className="mt-2 break-words text-xs leading-5 text-[var(--color-copy)]">
                {formatDate(selectedSlot.date)} - {selectedSlot.start_time.slice(0, 5)} - {selectedSlot.end_time.slice(0, 5)} - {selectedSlot.city}
              </p>
            ) : null}
          </div>

          {canUsePartialPayment ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPaymentChoice("total")} className={`rounded-[18px] border px-4 py-3 text-sm font-semibold ${paymentChoice === "total" ? "border-[var(--color-mocha)] bg-white text-[var(--color-ink)]" : "border-[var(--color-border)] bg-white/70 text-[var(--color-copy)]"}`}>
                Pagar completo
              </button>
              <button type="button" onClick={() => setPaymentChoice("anticipo")} className={`rounded-[18px] border px-4 py-3 text-sm font-semibold ${paymentChoice === "anticipo" ? "border-[var(--color-mocha)] bg-white text-[var(--color-ink)]" : "border-[var(--color-border)] bg-white/70 text-[var(--color-copy)]"}`}>
                Pagar anticipo
              </button>
            </div>
          ) : null}

          <div className="mt-4 rounded-[20px] bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Monto a pagar ahora</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{formatMoney(payableAmount)}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
              Total del pedido: {formatMoney(totalAmount)} - Saldo pendiente estimado: {formatMoney(Math.max(totalAmount - payableAmount, 0))}
            </p>
          </div>

          {totalAmount <= 0 || !hasAvailableTreatmentSlots ? (
            <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {totalAmount <= 0 ? <p>Falta configurar el precio de pago directo para este tratamiento.</p> : null}
              {!hasAvailableTreatmentSlots ? <p>Ya no quedan cupos disponibles para este tratamiento.</p> : null}
            </div>
          ) : null}

          {paymentQrImage ? (
            <div className="mt-5 flex flex-col items-start gap-4 rounded-[20px] bg-white/65 p-4 sm:flex-row sm:items-center">
              <img src={paymentQrImage} alt="QR general de pagos" className="h-40 w-40 rounded-[20px] object-contain sm:h-52 sm:w-52" />
              <div className="grid gap-3">
                <p className="text-sm leading-7 text-[var(--color-copy)]">
                  Escanea el QR, realiza tu pago y luego sube el comprobante para enviar tu pedido.
                </p>
                <a href={paymentQrImage} target="_blank" rel="noreferrer" className="inline-flex w-full justify-center rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold sm:w-auto">
                  Ver o descargar QR
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Aun no configuramos el QR general de pagos. El admin puede subirlo desde Panel / Configuracion.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="w-full rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-center text-sm font-semibold sm:w-auto">
              {receiptFile ? "Cambiar comprobante" : "Subir comprobante"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} disabled={savingOrder} />
            </label>
            {latestOrder?.payment_receipt_path ? (
              <button type="button" onClick={() => void openReceipt()} className="w-full rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold sm:w-auto">
                Ver ultimo comprobante
              </button>
            ) : null}
          </div>

          {receiptFile ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Comprobante listo para enviar: <strong className="text-[var(--color-ink)]">{receiptFile.name}</strong>
            </p>
          ) : null}

          {latestOrder?.admin_notes ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">Administracion en tu ultimo pedido: {latestOrder.admin_notes}</p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => setOrderStep(shouldChooseSlot ? "horario" : "datos")} className="w-full rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold sm:w-auto">
              Volver
            </button>
            <button type="button" onClick={() => void submitOrder()} disabled={!canSubmitOrder || savingOrder} className="w-full rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
              {savingOrder ? "Enviando..." : "Enviar pedido y pago"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>,
    document.body
  );
}

function OrderSteps({ current, shouldChooseSlot }: { current: OrderStep; shouldChooseSlot: boolean }) {
  const steps: { id: OrderStep; label: string }[] = [
    { id: "datos", label: "Datos" },
    ...(shouldChooseSlot ? [{ id: "horario" as OrderStep, label: "Horario" }] : []),
    { id: "pago", label: "Pago" },
  ];
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <div className="mt-6 grid gap-2 md:grid-cols-3">
      {steps.map((step, index) => {
        const active = step.id === current;
        const completed = index < currentIndex;

        return (
          <div
            key={step.id}
            className={`rounded-[18px] border px-4 py-3 text-sm font-semibold ${
              active
                ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                : completed
                  ? "border-[rgba(111,122,96,0.24)] bg-[rgba(111,122,96,0.12)] text-[var(--color-ink)]"
                  : "border-[var(--color-border)] bg-white/70 text-[var(--color-copy)]"
            }`}
          >
            Paso {index + 1}: {step.label}
          </div>
        );
      })}
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

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-1 break-words font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function getSlotKey(slot: AvailableSlot) {
  return `${slot.rule_id}-${slot.date}-${slot.start_time}-${slot.end_time}`;
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
    <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-x-hidden bg-[rgba(43,33,27,0.44)] p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`max-h-[94vh] w-full overflow-x-hidden overflow-y-auto rounded-[28px] bg-[var(--color-surface)] p-4 shadow-[0_30px_90px_rgba(43,33,27,0.25)] sm:max-h-[92vh] sm:rounded-[32px] sm:p-6 md:p-8 ${maxWidthClassName}`}>
        <div className="mb-6 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
