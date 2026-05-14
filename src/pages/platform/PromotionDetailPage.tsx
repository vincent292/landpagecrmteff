import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import {
  attachPromotionOrderReceipt,
  getMyPromotionOrders,
  getPromotionOrderReceiptUrl,
  savePromotionOrder,
  uploadPromotionOrderReceipt,
  type PromotionOrderRow,
} from "../../services/promotionOrderService";
import {
  getPromotionBySlug,
  getPromotionVariantRemainingSlots,
  type PromotionRow,
  type PromotionVariantRow,
} from "../../services/promotionService";
import { updateMyProfile } from "../../services/profileService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { formatDate, formatMoney } from "../../utils/text";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

type FlashMessage = {
  tone: "success" | "error";
  text: string;
};

type PaymentChoice = "total" | "anticipo";
type OrderStep = "datos" | "horario" | "pago";
const defaultPromotionAppointmentType = "Promocion directa";

export function PromotionDetailPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [promotion, setPromotion] = useState<PromotionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);
  const [orders, setOrders] = useState<PromotionOrderRow[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("total");
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [appointmentSlots, setAppointmentSlots] = useState<AvailableSlot[]>([]);
  const [loadingAppointmentSlots, setLoadingAppointmentSlots] = useState(false);
  const [selectedSlotsByVariantId, setSelectedSlotsByVariantId] = useState<Record<string, AvailableSlot | null>>({});
  const [activeScheduleVariantId, setActiveScheduleVariantId] = useState<string | null>(null);
  const [selectedSlotDate, setSelectedSlotDate] = useState<string | null>(null);
  const [orderStep, setOrderStep] = useState<OrderStep>("datos");
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const { user, profile, refreshProfile } = useAuth();
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
    if (!slug) return;
    getPromotionBySlug(slug)
      .then((row) => setPromotion(row))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    getMyPromotionOrders(user.id).then(setOrders).catch(() => undefined);
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
    const wantsReserve = searchParams.get("accion") === "reservar";
    if (!wantsReserve || !promotion) return;
    if (promotion.allows_direct_booking) {
      handleOpenOrder();
    } else {
      setShowInfoModal(true);
    }
  }, [promotion, searchParams]);

  useEffect(() => {
    if (!showOrderModal && !showAuthPrompt) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAuthPrompt, showOrderModal]);

  useEffect(() => {
    const slotCity = form.city.trim() || promotion?.city?.trim() || "";
    if (!showOrderModal || !form.wants_appointment || !slotCity || !promotion || promotion.agenda_mode !== "choose_slot") {
      setAppointmentSlots([]);
      return;
    }

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 45);

    setLoadingAppointmentSlots(true);
    const filters = {
      city: slotCity,
      appointment_type: promotion.appointment_type || defaultPromotionAppointmentType,
      agenda_tag: promotion.agenda_tag ?? null,
      date_from: from.toISOString().slice(0, 10),
      date_to: to.toISOString().slice(0, 10),
    };

    getAvailableSlots({
      ...filters,
      doctor_id: promotion.doctor_id ?? null,
    })
      .then((rows) => {
        if (rows.length > 0 || !promotion.doctor_id) return rows;
        return getAvailableSlots(filters);
      })
      .then((rows) => {
        setAppointmentSlots(rows);
        setSelectedSlotsByVariantId((current) =>
          Object.fromEntries(
            Object.entries(current).map(([variantId, slot]) => [
              variantId,
              slot && rows.some((availableSlot) => getSlotKey(availableSlot) === getSlotKey(slot)) ? slot : null,
            ])
          )
        );
      })
      .catch(() => {
        setAppointmentSlots([]);
        setSelectedSlotsByVariantId((current) =>
          Object.fromEntries(Object.keys(current).map((variantId) => [variantId, null]))
        );
      })
      .finally(() => setLoadingAppointmentSlots(false));
  }, [form.city, form.wants_appointment, promotion, showOrderModal]);

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

    const preferredDate = activeScheduleVariantId ? selectedSlotsByVariantId[activeScheduleVariantId]?.date : null;
    setSelectedSlotDate((current) => {
      if (preferredDate && groupedAppointmentSlots.some((group) => group.date === preferredDate)) return preferredDate;
      return current && groupedAppointmentSlots.some((group) => group.date === current)
        ? current
        : groupedAppointmentSlots[0].date;
    });
  }, [activeScheduleVariantId, groupedAppointmentSlots, selectedSlotsByVariantId]);

  const paymentQrImage = settings?.payment_qr_image ?? null;
  const variants = promotion?.promotion_variants ?? [];
  const selectedVariants = useMemo(
    () => variants.filter((variant) => selectedVariantIds.includes(variant.id)),
    [selectedVariantIds, variants]
  );
  const latestOrder = useMemo(
    () => orders.find((order) => order.promotion_id === promotion?.id) ?? null,
    [orders, promotion?.id]
  );
  const cartTotal = selectedVariants.reduce((sum, variant) => sum + Number(variant.price_total ?? 0), 0);
  const canUsePartialPayment = selectedVariants.length > 0 && selectedVariants.every((variant) => variant.allows_partial_payment || promotion?.allows_partial_payment);
  const partialPercent = Number(
    selectedVariants.find((variant) => variant.allows_partial_payment)?.partial_payment_percent ??
      promotion?.partial_payment_percent ??
      50
  );
  const payableAmount = useMemo(() => {
    if (paymentChoice === "anticipo" && canUsePartialPayment) {
      return Number(((cartTotal * partialPercent) / 100).toFixed(2));
    }
    return Number(cartTotal.toFixed(2));
  }, [canUsePartialPayment, cartTotal, partialPercent, paymentChoice]);

  const detailPath = `/promociones/${promotion?.slug ?? slug}`;
  const shouldChooseSlot = Boolean(form.wants_appointment && promotion?.agenda_mode === "choose_slot");
  const dataStepComplete =
    form.full_name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.document_number.trim().length > 0;
  const scheduleStepComplete = !shouldChooseSlot || selectedVariants.every((variant) => Boolean(selectedSlotsByVariantId[variant.id]));
  const activeScheduleVariant =
    selectedVariants.find((variant) => variant.id === activeScheduleVariantId) ?? selectedVariants[0] ?? null;
  const activeScheduleSlot = activeScheduleVariant ? selectedSlotsByVariantId[activeScheduleVariant.id] ?? null : null;
  const usedSlotKeys = new Set(
    selectedVariants
      .filter((variant) => variant.id !== activeScheduleVariant?.id)
      .map((variant) => selectedSlotsByVariantId[variant.id])
      .filter((slot): slot is AvailableSlot => Boolean(slot))
      .map((slot) => getSlotKey(slot))
  );
  const visibleAppointmentSlots = groupedAppointmentSlots.find((group) => group.date === selectedSlotDate)?.slots ?? [];
  const canSubmitOrder =
    dataStepComplete &&
    scheduleStepComplete &&
    selectedVariants.length > 0 &&
    selectedVariants.every((variant) => getPromotionVariantRemainingSlots(variant) > 0) &&
    Boolean(paymentQrImage) &&
    Boolean(receiptFile);

  useEffect(() => {
    if (orderStep === "horario" && !shouldChooseSlot) {
      setOrderStep("pago");
    }
  }, [orderStep, shouldChooseSlot]);

  useEffect(() => {
    if (selectedVariants.length === 0) {
      setActiveScheduleVariantId(null);
      return;
    }

    setActiveScheduleVariantId((current) =>
      current && selectedVariants.some((variant) => variant.id === current) ? current : selectedVariants[0].id
    );
  }, [selectedVariants]);

  if (!slug) return <Navigate to="/promociones" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState label="Cargando promocion..." /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState label="No pudimos cargar esta promocion." /></section>;
  if (!promotion) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos esta promocion." /></section>;

  function clearReserveIntent() {
    if (!searchParams.get("accion")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("accion");
    setSearchParams(next, { replace: true });
  }

  function setFlashMessage(tone: FlashMessage["tone"], text: string) {
    setMessage({ tone, text });
  }

  function toggleVariant(variant: PromotionVariantRow) {
    if (getPromotionVariantRemainingSlots(variant) <= 0) return;
    setSelectedVariantIds((current) => {
      if (current.includes(variant.id)) {
        setSelectedSlotsByVariantId((selectedSlots) => {
          const next = { ...selectedSlots };
          delete next[variant.id];
          return next;
        });
        return current.filter((id) => id !== variant.id);
      }

      return [...current, variant.id];
    });
    setPaymentChoice("total");
  }

  function handleOpenOrder() {
    clearReserveIntent();
    if (!promotion?.allows_direct_booking) {
      setShowInfoModal(true);
      return;
    }
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    if (selectedVariants.length === 0 && variants[0]) {
      setSelectedVariantIds([variants[0].id]);
    }
    setMessage(null);
    setOrderStep("datos");
    setShowOrderModal(true);
  }

  async function refreshOrders() {
    if (!user) return;
    const rows = await getMyPromotionOrders(user.id);
    setOrders(rows);
  }

  async function submitOrder() {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    if (selectedVariants.length === 0) {
      setFlashMessage("error", "Selecciona una o mas opciones antes de continuar.");
      return;
    }
    if (selectedVariants.some((variant) => getPromotionVariantRemainingSlots(variant) <= 0)) {
      setFlashMessage("error", "Una de las opciones seleccionadas ya no tiene cupos disponibles.");
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

      const order = await savePromotionOrder({
        promotion_id: promotion!.id,
        user_id: user.id,
        full_name: form.full_name,
        document_number: form.document_number,
        phone: form.phone,
        email: form.email,
        city: form.city,
        notes: form.notes,
        wants_appointment: form.wants_appointment,
        payment_mode: paymentChoice,
        payment_percent: paymentChoice === "anticipo" && canUsePartialPayment ? partialPercent : 100,
        total_amount: cartTotal,
        items: selectedVariants.map((variant) => ({
          variant_id: variant.id,
          title: variant.title,
          unit_price: variant.price_total,
          quantity: 1,
          preferred_slot: form.wants_appointment ? (
            selectedSlotsByVariantId[variant.id]
              ? {
                  rule_id: selectedSlotsByVariantId[variant.id]!.rule_id,
                  date: selectedSlotsByVariantId[variant.id]!.date,
                  start_time: selectedSlotsByVariantId[variant.id]!.start_time,
                  end_time: selectedSlotsByVariantId[variant.id]!.end_time,
                  city: selectedSlotsByVariantId[variant.id]!.city,
                  location: selectedSlotsByVariantId[variant.id]!.location,
                  appointment_type: selectedSlotsByVariantId[variant.id]!.appointment_type,
                  agenda_tag: selectedSlotsByVariantId[variant.id]!.agenda_tag ?? promotion!.agenda_tag ?? null,
                }
              : null
          ) : null,
        })),
      });

      if (receiptFile) {
        const path = await uploadPromotionOrderReceipt(receiptFile, order.id);
        await attachPromotionOrderReceipt(order.id, path);
      }

      const appointmentMessage =
        form.wants_appointment && shouldChooseSlot
          ? " Guardamos los horarios elegidos por cada opcion; se confirman cuando administracion apruebe el pago."
          : form.wants_appointment
            ? " Administracion coordinara tu horario cuando revise el pago."
            : "";

      await refreshOrders();
      setReceiptFile(null);
      setSelectedSlotsByVariantId({});
      setFlashMessage("success", `Tu pedido fue enviado con comprobante. Administracion revisara el pago y aprobara tus opciones.${appointmentMessage}`);
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "";
      setFlashMessage("error", detail ? `No pudimos guardar tu pedido. ${detail}` : "No pudimos guardar tu pedido.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function openReceipt() {
    const url = await getPromotionOrderReceiptUrl(latestOrder?.payment_receipt_path ?? null);
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
      setFlashMessage("error", "Elige un horario disponible para cada opcion antes de continuar al pago.");
      setOrderStep("horario");
      return;
    }
    setMessage(null);
    setOrderStep("pago");
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 pb-32 md:px-8 md:py-20 md:pb-20">
      <div className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Promocion · {getDisplayCity(promotion.city)}
        </p>
        <h1 className="font-display mt-3 text-5xl font-semibold leading-[0.95] md:text-6xl">{promotion.title}</h1>
        <DoctorByline doctor={promotion.doctor_profiles} />
        <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{promotion.description}</p>
        <div className="mt-6 grid gap-3 text-sm leading-7 text-[var(--color-copy)] sm:grid-cols-2">
          <p>Inicio: {formatPublicDate(promotion.start_date)}</p>
          <p>Vigencia: {formatPublicDate(promotion.end_date)}</p>
          <p>Ciudad: {getDisplayCity(promotion.city)}</p>
          <p>Opciones activas: {variants.length}</p>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(96,65,47,0.92),rgba(151,106,73,0.86))] p-6 text-white shadow-[0_24px_70px_rgba(62,42,31,0.14)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Elige una o mas opciones</p>
            <h2 className="mt-2 text-2xl font-semibold">{promotion.title}</h2>
            {variants.length > 0 ? (
              <div className="mt-5 divide-y divide-white/34">
                {variants.map((variant) => {
                  const selected = selectedVariantIds.includes(variant.id);
                  const remaining = getPromotionVariantRemainingSlots(variant);
                  const allowsPartial = variant.allows_partial_payment || promotion.allows_partial_payment;
                  const percent = Number(variant.partial_payment_percent ?? promotion.partial_payment_percent ?? 50);

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => toggleVariant(variant)}
                      className={`grid w-full gap-3 py-4 text-left transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${selected ? "text-white" : "text-white/84 hover:text-white"}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? "border-white bg-white text-[var(--color-mocha)]" : "border-white/60"}`}>
                        {selected ? "✓" : ""}
                      </span>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-snug sm:text-xl">{variant.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/68">
                          {allowsPartial ? `Anticipo ${percent}% disponible` : "Pago completo"} · {remaining} cupos
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-white sm:text-3xl">{formatMoney(variant.price_total).replace("Bs. ", "")}Bs.</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState label="Esta promocion todavia no tiene opciones configuradas." />
            )}
          </div>

          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6">
            <h2 className="text-2xl font-semibold">Como funciona</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[var(--color-copy)]">
              <li>1. Eliges una o varias opciones.</li>
              <li>2. Confirmas tus datos, subes el comprobante y administracion valida el pago.</li>
              <li>3. Cuando se aprueba, el ingreso pasa a caja automaticamente y se descuenta un cupo por cada opcion.</li>
              <li>4. Si corresponde, la doctora o administracion coordinan tu cita con los mismos datos que registraste.</li>
            </ul>
          </div>
        </div>

        <aside className="h-fit rounded-[28px] border border-[var(--color-border)] bg-white/72 p-6 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
          <p className="text-sm text-[var(--color-copy)]">{getDisplayCity(promotion.city)}</p>
          <h2 className="mt-3 text-3xl font-semibold">
            {selectedVariants.length ? formatMoney(cartTotal) : "Arma tu pedido"}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            {selectedVariants.length} opcion(es) seleccionada(s)
            <br />
            Vigente hasta {formatPublicDate(promotion.end_date)}
          </p>

          {selectedVariants.length > 0 ? (
            <div className="mt-4 grid gap-2 text-sm text-[var(--color-copy)]">
              {selectedVariants.map((variant) => (
                <div key={variant.id} className="rounded-[16px] bg-[rgba(247,242,236,0.78)] px-4 py-3">
                  <p className="font-semibold text-[var(--color-ink)]">{variant.title}</p>
                  <p>{formatMoney(variant.price_total)} · {getPromotionVariantRemainingSlots(variant)} cupos</p>
                </div>
              ))}
            </div>
          ) : null}

          {latestOrder ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Ultimo pedido: <strong className="text-[var(--color-ink)]">{latestOrder.status}</strong>
              <br />
              Pagado {formatMoney(latestOrder.amount_paid ?? 0)} · Pendiente {formatMoney(latestOrder.amount_pending ?? latestOrder.total_amount)}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            {promotion.allows_direct_booking ? (
              <button
                onClick={handleOpenOrder}
                disabled={selectedVariants.length === 0}
                className="w-full rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Reservar y pagar
              </button>
            ) : (
              <button onClick={() => setShowInfoModal(true)} className="w-full rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white">
                Solicitar promocion
              </button>
            )}
            <Link to="/promociones" className="rounded-full border border-[var(--color-border)] px-6 py-3 text-center text-sm font-semibold">
              Volver a promociones
            </Link>
          </div>
        </aside>
      </div>

      {!showOrderModal && !showAuthPrompt && promotion.allows_direct_booking ? (
        <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.94)] px-4 py-3 shadow-[0_-18px_48px_rgba(62,42,31,0.10)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{selectedVariants.length} opcion(es)</p>
              <p className="text-xs text-[var(--color-copy)]">{selectedVariants.length ? formatMoney(cartTotal) : "Selecciona una o mas opciones"}</p>
            </div>
            <button
              onClick={handleOpenOrder}
              disabled={selectedVariants.length === 0}
              className="shrink-0 rounded-full bg-[var(--color-caramel)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              Reservar
            </button>
          </div>
        </div>
      ) : null}

      {showAuthPrompt ? createPortal(
        <ModalShell onClose={() => setShowAuthPrompt(false)} maxWidthClassName="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Acceso requerido</p>
          <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">Para reservar esta promocion primero debes acceder a tu cuenta</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Asi guardamos tus datos, el comprobante, el saldo pendiente y el seguimiento en tu dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/login" state={{ from: `${detailPath}?accion=reservar` }} className="inline-flex items-center justify-center rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
              Iniciar sesion
            </Link>
            <Link to="/register" state={{ from: `${detailPath}?accion=reservar` }} className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 px-6 py-3 text-sm font-semibold text-[var(--color-ink)]">
              Crear cuenta
            </Link>
          </div>
        </ModalShell>,
        document.body
      ) : null}

      {showOrderModal ? createPortal(
        <ModalShell onClose={() => setShowOrderModal(false)} maxWidthClassName="max-w-5xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Pedido de promocion</p>
              <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">Confirma tus datos, paga y sube tu comprobante</h2>
            </div>
            {latestOrder?.status ? (
              <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
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

          <div className={`mt-8 grid gap-8 ${orderStep === "pago" ? "xl:grid-cols-[0.78fr_1.22fr]" : "xl:grid-cols-1"}`}>
            <div className={orderStep === "pago" ? "hidden" : "grid gap-4 md:grid-cols-2"}>
              <div className="md:col-span-2 rounded-[24px] bg-[rgba(247,242,236,0.82)] p-4 text-sm leading-7 text-[var(--color-copy)]">
                Paso 1: confirma tus datos. El numero de carnet tambien se guarda en tu perfil para no volver a pedirlo luego.
              </div>
              <Field label="Nombre completo">
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Correo">
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="premium-input" />
              </Field>
              <Field label="Celular">
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="premium-input" />
              </Field>
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
              <Field label="Numero de carnet">
                <input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} className="premium-input" />
              </Field>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Quiero que luego coordinen mi cita</span>
                <input type="checkbox" checked={form.wants_appointment} onChange={(event) => setForm((current) => ({ ...current, wants_appointment: event.target.checked }))} className="mt-2 h-5 w-5" />
              </label>
              {orderStep === "horario" && form.wants_appointment ? (
                <div className="md:col-span-2 rounded-[24px] border border-[var(--color-border)] bg-white/70 p-4">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">Paso 2: elige fecha y hora para cada opcion</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-copy)]">
                    {promotion.agenda_mode === "choose_slot"
                      ? `Mostramos horarios disponibles de tipo ${promotion.appointment_type || defaultPromotionAppointmentType}. Cada opcion debe quedar con su propio horario; recien se bloquea cuando administracion aprueba el pago.`
                      : "Esta promocion esta configurada para coordinar horario por WhatsApp despues de validar el pago."}
                  </p>
                  {promotion.agenda_mode === "choose_slot" ? (
                    <>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {selectedVariants.map((variant) => {
                          const slot = selectedSlotsByVariantId[variant.id] ?? null;
                          const selected = activeScheduleVariant?.id === variant.id;

                          return (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => setActiveScheduleVariantId(variant.id)}
                              className={`rounded-[20px] border px-4 py-4 text-left transition ${
                                selected
                                  ? "border-[var(--color-mocha)] bg-[rgba(111,92,75,0.08)]"
                                  : "border-[var(--color-border)] bg-white/80"
                              }`}
                            >
                              <p className="font-semibold text-[var(--color-ink)]">{variant.title}</p>
                              <p className="mt-2 text-sm text-[var(--color-copy)]">
                                {slot
                                  ? `${formatDate(slot.date)} · ${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
                                  : "Aun no elegiste horario para esta opcion."}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      {activeScheduleVariant ? (
                        <div className="mt-5 rounded-[20px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            Horario para: {activeScheduleVariant.title}
                          </p>
                          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                            {groupedAppointmentSlots.map((group) => (
                              <button
                                key={group.date}
                                type="button"
                                onClick={() => setSelectedSlotDate(group.date)}
                                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                  selectedSlotDate === group.date
                                    ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                                    : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                                }`}
                              >
                                {formatDate(group.date)}
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                            {loadingAppointmentSlots ? <p className="text-sm text-[var(--color-copy)]">Buscando horarios...</p> : null}
                            {!loadingAppointmentSlots && appointmentSlots.length === 0 ? (
                              <p className="text-sm leading-6 text-[var(--color-copy)]">
                                No hay horarios disponibles para {form.city.trim() || promotion.city || "tu ciudad"} por ahora. Revisa que la disponibilidad este activa, sea de tipo {promotion.appointment_type || defaultPromotionAppointmentType} y este dentro de la vigencia de la promocion.
                              </p>
                            ) : null}
                            {visibleAppointmentSlots.map((slot) => {
                              const slotKey = getSlotKey(slot);
                              const selectedSlot = activeScheduleSlot && getSlotKey(activeScheduleSlot) === slotKey;
                              const usedByAnotherOption = usedSlotKeys.has(slotKey);

                              return (
                                <button
                                  key={slotKey}
                                  type="button"
                                  onClick={() =>
                                    setSelectedSlotsByVariantId((current) => ({
                                      ...current,
                                      [activeScheduleVariant.id]: slot,
                                    }))
                                  }
                                  disabled={usedByAnotherOption}
                                  className={`rounded-[18px] border px-4 py-3 text-left text-sm transition ${
                                    selectedSlot
                                      ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                                      : usedByAnotherOption
                                        ? "border-[var(--color-border)] bg-white/60 text-[var(--color-copy)] opacity-70"
                                        : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                                  }`}
                                >
                                  <span className="font-semibold">{formatDate(slot.date)}</span>
                                  <span className="mt-1 block text-xs opacity-80">
                                    {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)} · {slot.available_capacity} cupo(s)
                                  </span>
                                  {usedByAnotherOption ? (
                                    <span className="mt-1 block text-[11px] opacity-80">
                                      Ya elegiste este horario en otra opcion.
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <Field label="Notas">
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="premium-input min-h-28" />
              </Field>
              <div className="md:col-span-2 flex flex-wrap gap-3">
                {orderStep === "datos" ? (
                  <button type="button" onClick={shouldChooseSlot ? goToScheduleStep : goToPaymentStep} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                    {shouldChooseSlot ? "Continuar a horario" : "Continuar al pago"}
                  </button>
                ) : null}
                {orderStep === "horario" ? (
                  <>
                    <button type="button" onClick={() => setOrderStep("datos")} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                      Volver a datos
                    </button>
                    <button type="button" onClick={goToPaymentStep} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                      Continuar al pago
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className={orderStep === "pago" ? "rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5" : "hidden"}>
              <p className="text-sm font-semibold text-[var(--color-ink)]">Paso 3: revisa tu pedido y pago</p>
              <div className="mt-4 grid gap-3">
                {selectedVariants.map((variant) => ({
                  id: variant.id,
                  title_snapshot: variant.title,
                  unit_price: variant.price_total,
                  quantity: 1,
                })).map((item) => {
                  const slot = selectedSlotsByVariantId[item.id] ?? null;

                  return (
                  <div key={item.id} className="rounded-[18px] border border-[var(--color-border)] bg-white/80 p-3 text-sm">
                    <p className="font-semibold text-[var(--color-ink)]">{item.title_snapshot}</p>
                    <p className="mt-1 text-[var(--color-copy)]">{formatMoney(item.unit_price)} · cantidad {item.quantity}</p>
                    {slot ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--color-copy)]">
                        {formatDate(slot.date)} · {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)} · {slot.city}
                      </p>
                    ) : null}
                  </div>
                  );
                })}
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
                  Total del pedido: {formatMoney(cartTotal)} · Saldo pendiente estimado: {formatMoney(Math.max(cartTotal - payableAmount, 0))}
                </p>
              </div>

              {paymentQrImage ? (
                <>
                  <img src={paymentQrImage} alt="QR general de pagos" className="mt-4 h-56 w-56 rounded-[20px] object-contain" />
                  <a href={paymentQrImage} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    Ver o descargar QR
                  </a>
                </>
              ) : (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Aun no configuramos el QR general de pagos. El admin puede subirlo desde Panel / Configuracion.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                  {receiptFile ? "Cambiar comprobante" : "Subir comprobante"}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} disabled={savingOrder} />
                </label>
                {latestOrder?.payment_receipt_path ? (
                  <button onClick={() => void openReceipt()} className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
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

              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setOrderStep(shouldChooseSlot ? "horario" : "datos")} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                  Volver
                </button>
                <button onClick={() => void submitOrder()} disabled={!canSubmitOrder || savingOrder} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {savingOrder ? "Enviando..." : "Enviar pedido y pago"}
                </button>
              </div>
            </div>
          </div>
        </ModalShell>,
        document.body
      ) : null}

      <InfoRequestModal open={showInfoModal} interest={promotion.title} interestId={promotion.id} interestType="Promoción" onClose={() => {
        clearReserveIntent();
        setShowInfoModal(false);
      }} />
    </section>
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
    <div className="mt-6 grid gap-2 sm:grid-cols-3">
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
