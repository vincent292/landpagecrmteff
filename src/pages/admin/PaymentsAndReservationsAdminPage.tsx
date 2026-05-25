import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Download, MessageCircleMore, RefreshCcw, Wallet } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { getSignedUrl } from "../../services/storageService";
import {
  generateBookToken,
} from "../../services/bookTokenService";
import {
  getCashPaymentMethods,
  getCashRegisterSessions,
  type CashPaymentMethodRow,
} from "../../services/cashService";
import {
  approveEnrollmentPayment,
  getCourseEnrollmentReceiptUrl,
  updateEnrollmentNotes,
  updateEnrollmentStatus,
} from "../../services/enrollmentService";
import {
  updateBookOrderNotes,
  updateBookOrderStatus,
  verifyBookOrder,
} from "../../services/bookOrderService";
import { getMyDoctorProfile } from "../../services/doctorService";
import {
  approvePromotionOrder,
  getPromotionOrderReceiptUrl,
  updatePromotionOrderNotes,
  updatePromotionOrderStatus,
} from "../../services/promotionOrderService";
import {
  getPaymentsAndReservationsFeed,
  type PaymentsAndReservationsItem,
} from "../../services/paymentsAndReservationsService";
import {
  approveReservationPayment,
  getReservationReceiptUrl,
  rejectReservationPayment,
  updateReservation,
} from "../../services/reservationService";
import { formatDate, formatMoney } from "../../utils/text";
import { buildWhatsAppHref, normalizePhoneForWhatsApp } from "../../utils/whatsapp";

const statusOptions = [
  { value: "pending", label: "Por revisar" },
  { value: "approved", label: "Aprobados" },
  { value: "rejected", label: "Rechazados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "all", label: "Todos" },
] as const;

type ApprovalDraft = {
  item: PaymentsAndReservationsItem;
  amount: number;
  paymentMethod: string;
  notes: string;
};

export function PaymentsAndReservationsAdminPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<PaymentsAndReservationsItem[]>([]);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [cashOpen, setCashOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]["value"]>("pending");
  const [kindFilter, setKindFilter] = useState<"all" | PaymentsAndReservationsItem["kind"] | "manual_reservation">("all");
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setError("");
    const doctorProfile =
      role === "doctor" && user?.id
        ? await getMyDoctorProfile(user.id).catch(() => null)
        : null;
    const [feed, methods, sessions] = await Promise.all([
      getPaymentsAndReservationsFeed({
        role,
        doctorProfileId: doctorProfile?.id ?? null,
      }),
      getCashPaymentMethods(true),
      getCashRegisterSessions(),
    ]);

    setDoctorProfileId(doctorProfile?.id ?? null);
    setItems(feed);
    setPaymentMethods(methods);
    setCashOpen(sessions.some((session) => session.status === "abierta"));
  };

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No pudimos cargar pagos y reservas."))
      .finally(() => setLoading(false));
  }, [role, user?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("payments-and-reservations-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "promotion_orders" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "course_enrollments" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "book_orders" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointment_reservations" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [doctorProfileId, role]);

  const visibleKinds = useMemo(() => {
    if (role === "doctor") {
      return [
        { value: "promotion", label: "Promociones" },
        { value: "reservation", label: "Valoraciones y reservas" },
        { value: "manual_reservation", label: "Citas manuales" },
      ] as const;
    }

    return [
      { value: "promotion", label: "Promociones" },
      { value: "reservation", label: "Valoraciones y reservas" },
      { value: "manual_reservation", label: "Citas manuales" },
      { value: "course", label: "Cursos" },
      { value: "book", label: "Libros" },
    ] as const;
  }, [role]);

  const dateScopedItems = useMemo(() => {
    if (!dateFilter) return items;
    return items.filter((item) => toInputDate(item.createdAt) === dateFilter);
  }, [dateFilter, items]);

  const statusScopedItems = useMemo(() => {
    if (statusFilter === "all") return dateScopedItems;
    return dateScopedItems.filter((item) => item.statusGroup === statusFilter);
  }, [dateScopedItems, statusFilter]);

  const filtered = useMemo(() => {
    return dateScopedItems.filter((item) => {
      const statusMatches =
        statusFilter === "all" ? true : item.statusGroup === statusFilter;
      const kindMatches =
        kindFilter === "all"
          ? true
          : kindFilter === "manual_reservation"
            ? item.kind === "reservation" && item.reservationCategory === "manual"
            : item.kind === kindFilter && !(item.kind === "reservation" && item.reservationCategory === "manual" && kindFilter === "reservation");
      const text = JSON.stringify([
        item.title,
        item.customerName,
        item.phone,
        item.email,
        item.city,
        item.sourceLabel,
        item.kind === "book" ? item.row.document_number : "",
      ]).toLowerCase();
      const queryMatches = text.includes(query.trim().toLowerCase());
      return statusMatches && kindMatches && queryMatches;
    });
  }, [dateScopedItems, kindFilter, query, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: dateScopedItems.length,
      pending: dateScopedItems.filter((item) => item.statusGroup === "pending").length,
      approved: dateScopedItems.filter((item) => item.statusGroup === "approved").length,
      rejected: dateScopedItems.filter((item) => item.statusGroup === "rejected").length,
      cancelled: dateScopedItems.filter((item) => item.statusGroup === "cancelled").length,
    };
  }, [dateScopedItems]);

  const kindCounts = useMemo(() => {
    return {
      all: statusScopedItems.length,
      promotion: statusScopedItems.filter((item) => item.kind === "promotion").length,
      reservation: statusScopedItems.filter((item) => item.kind === "reservation" && item.reservationCategory !== "manual").length,
      manual_reservation: statusScopedItems.filter((item) => item.kind === "reservation" && item.reservationCategory === "manual").length,
      course: statusScopedItems.filter((item) => item.kind === "course").length,
      book: statusScopedItems.filter((item) => item.kind === "book").length,
    };
  }, [statusScopedItems]);

  const getDraftNotes = (item: PaymentsAndReservationsItem) =>
    notesDrafts[item.id] ?? item.notes ?? "";

  const saveNotes = async (item: PaymentsAndReservationsItem) => {
    const notes = getDraftNotes(item);
    try {
      if (item.kind === "promotion") {
        await updatePromotionOrderNotes(item.id, notes);
      } else if (item.kind === "course") {
        await updateEnrollmentNotes(item.id, notes);
      } else if (item.kind === "book") {
        await updateBookOrderNotes(item.id, notes);
      } else {
        await updateReservation(item.id, { admin_notes: notes });
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pudimos guardar las notas.");
    }
  };

  const openApproval = (item: PaymentsAndReservationsItem) => {
    setApprovalDraft({
      item,
      amount: item.amountExpected > 0 ? item.amountExpected : item.amountPaid,
      paymentMethod:
        item.paymentMethod ??
        paymentMethods.find((method) => method.is_default)?.code ??
        "qr",
      notes: getDraftNotes(item),
    });
  };

  const handleApprove = async () => {
    if (!approvalDraft) return;
    if (!cashOpen) {
      setError("Primero abre la caja para aprobar y registrar este pago.");
      return;
    }
    if (!approvalDraft.item.receiptPath) {
      setError("No se puede aprobar nada sin comprobante subido.");
      return;
    }
    if (approvalDraft.amount <= 0) {
      setError("El monto aprobado debe ser mayor a cero.");
      return;
    }

    setSavingApproval(true);
    setError("");
    setMessage("");

    try {
      let successMessage = "Pago aprobado y enviado correctamente a caja.";
      let whatsappMessage = "";

      if (approvalDraft.item.kind === "promotion") {
        await approvePromotionOrder(approvalDraft.item.id, {
          adminNotes: approvalDraft.notes,
          paymentAmount: approvalDraft.amount,
          paymentMethod: approvalDraft.paymentMethod,
        });
        whatsappMessage = buildApprovedWhatsappMessage(approvalDraft.item, approvalDraft.amount, approvalDraft.paymentMethod);
      } else if (approvalDraft.item.kind === "course") {
        await updateEnrollmentNotes(approvalDraft.item.id, approvalDraft.notes);
        await approveEnrollmentPayment(approvalDraft.item.id, {
          adminNotes: approvalDraft.notes,
          paymentAmount: approvalDraft.amount,
          paymentMethod: approvalDraft.paymentMethod,
        });
        whatsappMessage = buildApprovedWhatsappMessage(approvalDraft.item, approvalDraft.amount, approvalDraft.paymentMethod);
      } else if (approvalDraft.item.kind === "book") {
        await updateBookOrderNotes(approvalDraft.item.id, approvalDraft.notes);
        await verifyBookOrder(approvalDraft.item.id, {
          adminNotes: approvalDraft.notes,
          paymentAmount: approvalDraft.amount,
          paymentMethod: approvalDraft.paymentMethod,
        });
        const token = await generateBookToken(approvalDraft.item.id);
        successMessage = `Pago aprobado y token generado: ${token.token}`;
        whatsappMessage = buildApprovedWhatsappMessage(
          approvalDraft.item,
          approvalDraft.amount,
          approvalDraft.paymentMethod,
          token.token
        );
      } else {
        await approveReservationPayment(approvalDraft.item.id, {
          adminNotes: approvalDraft.notes,
          paymentAmount: approvalDraft.amount,
          paymentMethod: approvalDraft.paymentMethod,
        });
        whatsappMessage = buildApprovedWhatsappMessage(approvalDraft.item, approvalDraft.amount, approvalDraft.paymentMethod);
      }

      openWhatsAppConversation(approvalDraft.item.phone, whatsappMessage);
      setApprovalDraft(null);
      setMessage(successMessage);
      await load();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "No pudimos aprobar este pago.");
    } finally {
      setSavingApproval(false);
    }
  };

  const handleMoveToReview = async (item: PaymentsAndReservationsItem) => {
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const notes = getDraftNotes(item);
      if (item.kind === "promotion") {
        await updatePromotionOrderStatus(item.id, "En revision", notes);
      } else if (item.kind === "course") {
        await updateEnrollmentNotes(item.id, notes);
        await updateEnrollmentStatus(item.id, "En revision");
      } else if (item.kind === "book") {
        await updateBookOrderNotes(item.id, notes);
        await updateBookOrderStatus(item.id, "En revision");
      } else {
        await updateReservation(item.id, { admin_notes: notes });
      }
      setMessage("Elemento marcado para revision interna.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No pudimos actualizar el estado.");
    } finally {
      setBusyId("");
    }
  };

  const handleReject = async (item: PaymentsAndReservationsItem) => {
    const notes = getDraftNotes(item).trim();
    if (!notes) {
      setError("Escribe antes el motivo en notas administrativas para rechazar.");
      return;
    }

    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      if (item.kind === "promotion") {
        await updatePromotionOrderStatus(item.id, "Rechazado", notes);
      } else if (item.kind === "course") {
        await updateEnrollmentNotes(item.id, notes);
        await updateEnrollmentStatus(item.id, "Rechazado");
      } else if (item.kind === "book") {
        await updateBookOrderNotes(item.id, notes);
        await updateBookOrderStatus(item.id, "Rechazado");
      } else {
        await rejectReservationPayment(item.id, notes);
      }
      openWhatsAppConversation(item.phone, buildRejectedWhatsappMessage(item, notes));
      setMessage("Pago rechazado correctamente.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No pudimos rechazar este pago.");
    } finally {
      setBusyId("");
    }
  };

  const getReceiptUrl = async (item: PaymentsAndReservationsItem) => {
    if (!item.receiptPath) return null;
    if (item.kind === "promotion") return getPromotionOrderReceiptUrl(item.receiptPath);
    if (item.kind === "course") return getCourseEnrollmentReceiptUrl(item.receiptPath);
    if (item.kind === "reservation") return getReservationReceiptUrl(item.receiptPath);
    return getSignedUrl("payment-receipts-private", item.receiptPath);
  };

  const openReceipt = async (item: PaymentsAndReservationsItem) => {
    const url = await getReceiptUrl(item);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadReceipt = async (item: PaymentsAndReservationsItem) => {
    const url = await getReceiptUrl(item);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `comprobante-${item.kind}-${item.id}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  };

  if (loading) return <LoadingState label="Cargando pagos y reservas..." />;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Operacion clinica
            </p>
            <h1 className="font-display mt-3 text-5xl font-semibold">
              Pagos y Reservas
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
              Aqui revisamos todo lo que implique comprobante, aprobacion, caja y seguimiento de horarios:
              promociones, cursos, libros, valoraciones y reservas de pago.
            </p>
          </div>
          <div className={`rounded-[24px] border px-4 py-3 text-sm font-semibold ${cashOpen ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="inline-flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {cashOpen ? "Caja abierta: puedes aprobar pagos." : "Caja cerrada: no se puede aprobar hasta abrir caja."}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Por revisar"
            value={String(counts.pending)}
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          />
          <StatCard
            label="Aprobados"
            value={String(counts.approved)}
            active={statusFilter === "approved"}
            onClick={() => setStatusFilter("approved")}
          />
          <StatCard
            label="Rechazados"
            value={String(counts.rejected)}
            active={statusFilter === "rejected"}
            onClick={() => setStatusFilter("rejected")}
          />
          <StatCard
            label="Cancelados"
            value={String(counts.cancelled)}
            active={statusFilter === "cancelled"}
            onClick={() => setStatusFilter("cancelled")}
          />
          <StatCard
            label="Todos"
            value={String(counts.all)}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <TypeTab
            label="Todo"
            count={kindCounts.all}
            active={kindFilter === "all"}
            onClick={() => setKindFilter("all")}
          />
          {visibleKinds.map((option) => (
            <TypeTab
              key={option.value}
              label={option.label}
              count={kindCounts[option.value]}
              active={kindFilter === option.value}
              onClick={() => setKindFilter(option.value)}
            />
          ))}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar paciente, contenido, carnet, correo o ciudad"
            className="premium-input md:col-span-2 xl:col-span-1"
          />
          <div className="grid gap-3 sm:grid-cols-2 md:col-span-2 xl:col-span-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="premium-input"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as (typeof statusOptions)[number]["value"])}
              className="premium-input"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setDateFilter("")}
            className="rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold md:col-span-2 xl:col-span-1"
          >
            {dateFilter ? "Ver todas las fechas" : "Sin filtro de fecha"}
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}
      {!error && filtered.length === 0 ? (
        <EmptyState label="No hay pagos o reservas para esos filtros." />
      ) : null}
      {error ? <ErrorState label="No pudimos cargar la bandeja de pagos y reservas." /> : null}

      {!error && filtered.length > 0 ? (
        <div className="grid gap-4">
          {filtered.map((item) => {
            const approved = item.statusGroup === "approved";
            const canReject = !approved && item.statusGroup !== "cancelled";
            const canReview = !approved && item.statusGroup !== "rejected" && item.kind !== "reservation";
            const phone = normalizePhoneForWhatsApp(item.phone);

            return (
              <article
                key={`${item.kind}-${item.id}`}
                className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-[rgba(216,194,174,0.24)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                        {item.sourceLabel}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approved ? "bg-[rgba(111,122,96,0.16)] text-[var(--color-ink)]" : "bg-[rgba(62,42,31,0.08)] text-[var(--color-ink)]"}`}>
                        {item.statusLabel}
                      </span>
                      {approved ? (
                        <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
                          Aprobado y en caja
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      {item.customerName}
                      {item.phone ? ` · ${item.phone}` : ""}
                      {item.email ? ` · ${item.email}` : ""}
                      <br />
                      {item.city ?? "Sin ciudad"} · {formatDate(item.createdAt)}
                      <br />
                      Esperado {formatMoney(item.amountExpected)} · Aprobado {formatMoney(item.amountPaid)}{item.paymentMethod ? ` · ${item.paymentMethod}` : ""}
                      {item.kind === "reservation" ? (
                        <>
                          <br />
                          {formatDate(item.row.appointment_date)} · {item.row.start_time.slice(0, 5)} - {item.row.end_time.slice(0, 5)}
                          {item.row.doctor_profiles?.full_name ? ` · ${item.row.doctor_profiles.full_name}` : ""}
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:max-w-[420px] xl:justify-end">
                    {item.receiptPath ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void openReceipt(item)}
                          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                        >
                          Ver comprobante
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadReceipt(item)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                        >
                          <Download className="h-4 w-4" />
                          Descargar
                        </button>
                      </>
                    ) : null}
                    {canReview ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleMoveToReview(item)}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        En revision
                      </button>
                    ) : null}
                    {!approved ? (
                      <button
                        type="button"
                        onClick={() => openApproval(item)}
                        className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Aprobar y pasar a caja
                      </button>
                    ) : null}
                    {canReject ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleReject(item)}
                        className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                      >
                        Rechazar
                      </button>
                    ) : null}
                    {phone ? (
                      <a
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappMessage(item))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                      >
                        <MessageCircleMore className="h-4 w-4" />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>

                <textarea
                  value={getDraftNotes(item)}
                  onChange={(event) => setNotesDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                  onBlur={() => void saveNotes(item)}
                  className="premium-input mt-4 min-h-24"
                  placeholder="Notas administrativas. Si rechazas, escribe aqui el motivo que tambien saldra en WhatsApp."
                />
              </article>
            );
          })}
        </div>
      ) : null}

      {approvalDraft ? (
        <ModalShell
          title={`Aprobar ${approvalDraft.item.sourceLabel.toLowerCase()}`}
          onClose={() => setApprovalDraft(null)}
        >
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                Resumen
              </p>
              <p className="mt-2 text-lg font-semibold">{approvalDraft.item.title}</p>
              <p className="mt-1 text-sm text-[var(--color-copy)]">
                {approvalDraft.item.customerName} · {approvalDraft.item.sourceLabel}
              </p>
            </div>

            {!cashOpen ? (
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Primero debes abrir la caja. Mientras no haya una caja abierta, este pago no se puede aprobar.
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto aprobado">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(approvalDraft.amount)}
                  onChange={(event) =>
                    setApprovalDraft((current) =>
                      current
                        ? { ...current, amount: Number(event.target.value) }
                        : current
                    )
                  }
                  disabled={approvalDraft.item.fixedAmount}
                  className="premium-input disabled:cursor-not-allowed disabled:opacity-70"
                />
              </Field>
              <Field label="Metodo de pago">
                <select
                  value={approvalDraft.paymentMethod}
                  onChange={(event) =>
                    setApprovalDraft((current) =>
                      current
                        ? { ...current, paymentMethod: event.target.value }
                        : current
                    )
                  }
                  className="premium-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.code}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {approvalDraft.item.fixedAmount ? (
              <p className="text-sm leading-7 text-[var(--color-copy)]">
                Este monto viene fijo por el contenido y no se puede modificar desde aqui.
              </p>
            ) : null}

            <Field label="Notas administrativas">
              <textarea
                value={approvalDraft.notes}
                onChange={(event) =>
                  setApprovalDraft((current) =>
                    current
                      ? { ...current, notes: event.target.value }
                      : current
                  )
                }
                className="premium-input min-h-28"
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={savingApproval || !cashOpen}
              className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingApproval ? "Guardando..." : "Confirmar pago y abrir WhatsApp"}
            </button>
            <button
              type="button"
              onClick={() => setApprovalDraft(null)}
              className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
            >
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function buildWhatsappMessage(item: PaymentsAndReservationsItem) {
  const patientName = item.customerName || "hola";
  if (item.kind === "reservation") {
    return `Hola ${patientName}, te escribimos sobre tu reserva "${item.title}" del ${formatDate(item.row.appointment_date)} a las ${item.row.start_time.slice(0, 5)}.`;
  }

  return `Hola ${patientName}, te escribimos de parte de la Dra. Estefany sobre "${item.title}".`;
}

function buildApprovedWhatsappMessage(
  item: PaymentsAndReservationsItem,
  amount: number,
  paymentMethod: string,
  extraCode?: string
) {
  const patientName = item.customerName || "hola";
  const paymentLabel = paymentMethod.trim() ? ` por ${formatMoney(amount)} via ${paymentMethod}` : ` por ${formatMoney(amount)}`;

  if (item.kind === "reservation") {
    return `Hola ${patientName}, tu pago${paymentLabel} fue aprobado. Tu reserva "${item.title}" queda confirmada para el ${formatDate(item.row.appointment_date)} a las ${item.row.start_time.slice(0, 5)}. Si necesitas apoyo adicional, respondemos por este medio.`;
  }

  if (item.kind === "course") {
    return `Hola ${patientName}, tu pago${paymentLabel} fue aprobado. Tu inscripcion al curso "${item.title}" ya quedo confirmada y puedes seguir los proximos pasos desde tu plataforma.`;
  }

  if (item.kind === "book") {
    return `Hola ${patientName}, tu pago${paymentLabel} fue aprobado para el libro "${item.title}".${extraCode ? ` Tu token de descarga es ${extraCode}.` : ""} Puedes descargarlo desde tu panel en la seccion de descargas o desde la pagina publica del libro en la opcion de ingresar token. Si luego te registras con el mismo carnet, esta compra tambien quedara vinculada a tu cuenta.`;
  }

  return `Hola ${patientName}, tu pago${paymentLabel} fue aprobado para "${item.title}". Si elegiste horario o procedimiento, el equipo seguira el siguiente paso contigo por WhatsApp.`;
}

function buildRejectedWhatsappMessage(item: PaymentsAndReservationsItem, reason: string) {
  const patientName = item.customerName || "hola";
  return `Hola ${patientName}, no pudimos aprobar tu pago de "${item.title}" por el siguiente motivo: ${reason}. Si deseas, responde a este mensaje y te ayudamos a corregirlo.`;
}

function openWhatsAppConversation(phone: string | null, message: string) {
  const href = buildWhatsAppHref(phone, message);
  if (!href || typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function toInputDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border p-4 text-left transition ${
        active
          ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white shadow-[0_18px_40px_rgba(110,74,47,0.22)]"
          : "border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] text-[var(--color-ink)] hover:-translate-y-0.5 hover:bg-white"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${active ? "text-white/80" : "text-[var(--color-copy)]"}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${active ? "text-white" : "text-[var(--color-ink)]"}`}>{value}</p>
    </button>
  );
}

function TypeTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
          : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)] hover:bg-white"
      }`}
    >
      <span>{label}</span>
      <span
        className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
          active ? "bg-white/18 text-white" : "bg-[rgba(216,194,174,0.28)] text-[var(--color-mocha)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Pagos y reservas
            </p>
            <h2 className="font-display mt-2 text-4xl font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-6">{children}</div>
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
