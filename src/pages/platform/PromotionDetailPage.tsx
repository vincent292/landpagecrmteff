import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DoctorByline } from "../../components/platform/DoctorByline";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { useAuth } from "../../hooks/useAuth";
import {
  attachPromotionOrderReceipt,
  getMyPromotionOrders,
  getPromotionOrderItems,
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
import { formatMoney } from "../../utils/text";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

type FlashMessage = {
  tone: "success" | "error";
  text: string;
};

type PaymentChoice = "total" | "anticipo";

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

  const paymentQrImage = settings?.payment_qr_image ?? null;
  const variants = promotion?.promotion_variants ?? [];
  const selectedVariants = useMemo(
    () => variants.filter((variant) => selectedVariantIds.includes(variant.id)),
    [selectedVariantIds, variants]
  );
  const activeOrder = useMemo(
    () => orders.find((order) => order.promotion_id === promotion?.id && ["Pendiente", "En revision", "Aprobado"].includes(order.status)) ?? null,
    [orders, promotion?.id]
  );
  const orderItems = activeOrder ? getPromotionOrderItems(activeOrder) : [];
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
  const requiresNewReceipt = !activeOrder?.payment_receipt_path || activeOrder.status === "Rechazado";
  const canSubmitOrder =
    form.full_name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.document_number.trim().length > 0 &&
    selectedVariants.length > 0 &&
    selectedVariants.every((variant) => getPromotionVariantRemainingSlots(variant) > 0) &&
    Boolean(paymentQrImage) &&
    (!requiresNewReceipt || Boolean(receiptFile));
  const alreadySubmittedOrder = Boolean(activeOrder?.payment_receipt_path && activeOrder.status !== "Rechazado");

  useEffect(() => {
    if (!activeOrder || selectedVariantIds.length > 0) return;
    const itemVariantIds = getPromotionOrderItems(activeOrder).map((item) => item.variant_id).filter(Boolean);
    if (itemVariantIds.length > 0) {
      setSelectedVariantIds(itemVariantIds);
    }
  }, [activeOrder, selectedVariantIds.length]);

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
    setSelectedVariantIds((current) =>
      current.includes(variant.id)
        ? current.filter((id) => id !== variant.id)
        : [...current, variant.id]
    );
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
    if (alreadySubmittedOrder) return;
    if (selectedVariants.length === 0 && variants[0]) {
      setSelectedVariantIds([variants[0].id]);
    }
    setMessage(null);
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
        })),
      });

      if (receiptFile) {
        const path = await uploadPromotionOrderReceipt(receiptFile, order.id);
        await attachPromotionOrderReceipt(order.id, path);
      }

      await refreshOrders();
      setReceiptFile(null);
      setFlashMessage("success", "Tu pedido fue enviado con comprobante. Administracion revisara el pago y aprobara tus opciones.");
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "";
      setFlashMessage("error", detail ? `No pudimos guardar tu pedido. ${detail}` : "No pudimos guardar tu pedido.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function openReceipt() {
    const url = await getPromotionOrderReceiptUrl(activeOrder?.payment_receipt_path ?? null);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
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

          {activeOrder ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Estado actual: <strong className="text-[var(--color-ink)]">{activeOrder.status}</strong>
              <br />
              Pagado {formatMoney(activeOrder.amount_paid ?? 0)} · Pendiente {formatMoney(activeOrder.amount_pending ?? activeOrder.total_amount)}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            {promotion.allows_direct_booking ? (
              <button
                onClick={handleOpenOrder}
                disabled={alreadySubmittedOrder || selectedVariants.length === 0}
                className="w-full rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {alreadySubmittedOrder ? "Ya enviaste tu pedido" : "Reservar y pagar"}
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
              disabled={alreadySubmittedOrder || selectedVariants.length === 0}
              className="shrink-0 rounded-full bg-[var(--color-caramel)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {alreadySubmittedOrder ? "Ya pedido" : "Reservar"}
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
            {activeOrder?.status ? (
              <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
                {activeOrder.status}
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
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} className="premium-input" disabled={alreadySubmittedOrder} />
              </Field>
              <Field label="Correo">
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="premium-input" disabled={alreadySubmittedOrder} />
              </Field>
              <Field label="Celular">
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="premium-input" disabled={alreadySubmittedOrder} />
              </Field>
              <Field label="Ciudad">
                <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="premium-input" disabled={alreadySubmittedOrder} />
              </Field>
              <Field label="Numero de carnet">
                <input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} className="premium-input" disabled={alreadySubmittedOrder} />
              </Field>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Quiero que luego coordinen mi cita</span>
                <input type="checkbox" checked={form.wants_appointment} onChange={(event) => setForm((current) => ({ ...current, wants_appointment: event.target.checked }))} className="mt-2 h-5 w-5" disabled={alreadySubmittedOrder} />
              </label>
              <Field label="Notas">
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="premium-input min-h-28" disabled={alreadySubmittedOrder} />
              </Field>
            </div>

            <div className="rounded-[24px] bg-[rgba(247,242,236,0.82)] p-5">
              <p className="text-sm font-semibold text-[var(--color-ink)]">Paso 2: revisa tu pedido y pago</p>
              <div className="mt-4 grid gap-3">
                {(activeOrder ? orderItems : selectedVariants.map((variant) => ({
                  id: variant.id,
                  title_snapshot: variant.title,
                  unit_price: variant.price_total,
                  quantity: 1,
                }))).map((item) => (
                  <div key={item.id} className="rounded-[18px] border border-[var(--color-border)] bg-white/80 p-3 text-sm">
                    <p className="font-semibold text-[var(--color-ink)]">{item.title_snapshot}</p>
                    <p className="mt-1 text-[var(--color-copy)]">{formatMoney(item.unit_price)} · cantidad {item.quantity}</p>
                  </div>
                ))}
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
                {requiresNewReceipt && !alreadySubmittedOrder ? (
                  <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
                    {receiptFile ? "Cambiar comprobante" : activeOrder?.payment_receipt_path ? "Volver a subir comprobante" : "Subir comprobante"}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} disabled={savingOrder} />
                  </label>
                ) : null}
                {activeOrder?.payment_receipt_path ? (
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

              {alreadySubmittedOrder ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Tu pedido ya fue enviado con comprobante. Ya no puedes editarlo desde aqui.
                </p>
              ) : null}

              {activeOrder?.admin_notes ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">Administracion: {activeOrder.admin_notes}</p>
              ) : null}

              {!alreadySubmittedOrder ? (
                <div className="mt-6">
                  <button onClick={() => void submitOrder()} disabled={!canSubmitOrder || savingOrder} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                    {savingOrder ? "Enviando..." : "Enviar pedido y pago"}
                  </button>
                </div>
              ) : null}
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
