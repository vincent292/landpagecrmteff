import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import {
  approvePromotionOrder,
  getPromotionOrderItemPreferredSlot,
  getPromotionOrderItems,
  getPromotionOrderReceiptUrl,
  getPromotionOrdersAdmin,
  updatePromotionOrderNotes,
  updatePromotionOrderStatus,
  type PromotionOrderRow,
} from "../../services/promotionOrderService";
import { formatDate, formatMoney } from "../../utils/text";

type ApprovalDraft = {
  orderId: string;
  promotionTitle: string;
  itemsLabel: string;
  amount: number;
  paymentMethod: string;
  notes: string;
};

export function PromotionOrdersAdminPage() {
  const { role, profile, user } = useAuth();
  const [rows, setRows] = useState<PromotionOrderRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [promotionFilter, setPromotionFilter] = useState("Todas");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [pendingRealtime, setPendingRealtime] = useState(false);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [nextRows, nextMethods] = await Promise.all([
        getPromotionOrdersAdmin(role === "superadmin"),
        getCashPaymentMethods(true),
      ]);
      setRows(nextRows);
      setPaymentMethods(nextMethods);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  useEffect(() => {
    const isEditingListField = () => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) return false;
      if (!listRef.current?.contains(activeElement)) return false;
      return ["TEXTAREA", "INPUT", "SELECT"].includes(activeElement.tagName);
    };

    const syncRows = () => {
      if (isEditingListField()) {
        setPendingRealtime(true);
        return;
      }

      setPendingRealtime(false);
      void load();
    };

    const channel = supabase
      .channel("promotion-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "promotion_orders" }, syncRows)
      .subscribe();

    const handleFocusChange = () => {
      if (!pendingRealtime) return;
      if (isEditingListField()) return;
      setPendingRealtime(false);
      void load();
    };

    document.addEventListener("focusin", handleFocusChange);
    document.addEventListener("click", handleFocusChange);

    return () => {
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("click", handleFocusChange);
      void supabase.removeChannel(channel);
    };
  }, [pendingRealtime]);

  const promotionOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.promotions?.title).filter(Boolean))].sort((left, right) =>
        String(left).localeCompare(String(right))
      ),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const statusOk = statusFilter === "Todos" || row.status === statusFilter;
        const promotionOk = promotionFilter === "Todas" || (row.promotions?.title ?? "") === promotionFilter;
        const queryOk = JSON.stringify([
          row.full_name,
          row.email,
          row.phone,
          row.promotions?.title,
          row.promotion_variants?.title,
          ...getPromotionOrderItems(row).map((item) => item.title_snapshot),
        ])
          .toLowerCase()
          .includes(query.toLowerCase());
        return statusOk && promotionOk && queryOk;
      }),
    [promotionFilter, query, rows, statusFilter]
  );

  const openReceipt = async (path?: string | null) => {
    const url = await getPromotionOrderReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getRowNotes = (row: PromotionOrderRow) => notesDrafts[row.id] ?? row.admin_notes ?? "";

  const saveNotes = async (row: PromotionOrderRow) => {
    try {
      const nextNotes = getRowNotes(row);
      await updatePromotionOrderNotes(row.id, nextNotes);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "No pudimos guardar las notas.");
    }
  };

  const openApproval = (row: PromotionOrderRow) => {
    const itemsLabel = getPromotionOrderItems(row)
      .map((item) => item.title_snapshot)
      .filter(Boolean)
      .join(", ");

    setApprovalDraft({
      orderId: row.id,
      promotionTitle: row.promotions?.title ?? "Promocion",
      itemsLabel: itemsLabel || row.promotion_variants?.title || "Opciones",
      amount: Number(row.amount_paid ?? row.total_amount ?? 0),
      paymentMethod: row.payment_method ?? paymentMethods.find((method) => method.is_default)?.code ?? "qr",
      notes: getRowNotes(row),
    });
  };

  const handleApprove = async () => {
    if (!approvalDraft || approvalDraft.amount <= 0) return;
    setSavingApproval(true);
    setActionError("");
    setActionFeedback("");
    try {
      const baseRow = rows.find((row) => row.id === approvalDraft.orderId) ?? null;
      await approvePromotionOrder(approvalDraft.orderId, {
        adminNotes: approvalDraft.notes,
        paymentAmount: approvalDraft.amount,
        paymentMethod: approvalDraft.paymentMethod,
      });

      if (baseRow) {
        const href = buildPromotionOrderWhatsappHref({
          ...baseRow,
          status: "Aprobado",
          admin_notes: approvalDraft.notes,
          amount_paid: approvalDraft.amount,
          payment_method: approvalDraft.paymentMethod,
        });
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }

      setApprovalDraft(null);
      setActionFeedback("Pedido aprobado. Caja, cupos y mensaje al paciente listos.");
      await load();
    } catch (approvalError) {
      setActionError(approvalError instanceof Error ? approvalError.message : "No pudimos aprobar el pedido.");
    } finally {
      setSavingApproval(false);
    }
  };

  const handleReject = async (row: PromotionOrderRow) => {
    const notes = getRowNotes(row).trim();
    if (!notes) {
      setActionError("Escribe el motivo del rechazo en notas antes de rechazar.");
      return;
    }

    try {
      setActionError("");
      setActionFeedback("");
      await updatePromotionOrderStatus(row.id, "Rechazado", notes);
      const href = buildPromotionOrderWhatsappHref({ ...row, status: "Rechazado", admin_notes: notes });
      if (href) window.open(href, "_blank", "noopener,noreferrer");
      setActionFeedback("Pedido rechazado y mensaje preparado para WhatsApp.");
      await load();
    } catch (rejectError) {
      setActionError(rejectError instanceof Error ? rejectError.message : "No pudimos rechazar el pedido.");
    }
  };

  const handleRevision = async (row: PromotionOrderRow) => {
    try {
      setActionError("");
      setActionFeedback("");
      await updatePromotionOrderStatus(row.id, "En revision", getRowNotes(row));
      setActionFeedback("Pedido marcado en revision.");
      await load();
    } catch (revisionError) {
      setActionError(revisionError instanceof Error ? revisionError.message : "No pudimos actualizar el pedido.");
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Promociones</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">Pedidos, pagos y horarios</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
          Cada aprobacion registra el ingreso en caja, descuenta cupos y bloquea los horarios elegidos por cada opcion.
        </p>
        <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_260px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar paciente, promocion u opcion"
            className="premium-input"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
            <option>Todos</option>
            <option>Pendiente</option>
            <option>En revision</option>
            <option>Aprobado</option>
            <option>Rechazado</option>
            <option>Cancelado</option>
          </select>
          <select value={promotionFilter} onChange={(event) => setPromotionFilter(event.target.value)} className="premium-input">
            <option>Todas</option>
            {promotionOptions.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? <LoadingState label="Cargando pedidos de promociones..." /> : null}
      {actionError ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
          {actionError}
        </div>
      ) : null}
      {actionFeedback ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
          {actionFeedback}
        </div>
      ) : null}
      {error ? <ErrorState label="No pudimos cargar los pedidos de promociones." /> : null}
      {!loading && !error && filtered.length === 0 ? <EmptyState label="No hay pedidos para esos filtros." /> : null}

      {!loading && !error && filtered.length > 0 ? (
        <div ref={listRef} className="grid gap-4">
          {pendingRealtime ? (
            <div className="rounded-[20px] border border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.84)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Llegaron solicitudes nuevas o cambios en tiempo real. Los aplicamos cuando termines de escribir.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRealtime(false);
                    void load();
                  }}
                  className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Actualizar ahora
                </button>
              </div>
            </div>
          ) : null}

          {filtered.map((row) => {
            const items = getPromotionOrderItems(row);
            const approvedWhatsappHref = row.status === "Aprobado" ? buildPromotionOrderWhatsappHref(row) : null;
            const rejectedWhatsappHref = row.status === "Rechazado" ? buildPromotionOrderWhatsappHref(row) : null;

            return (
              <div key={row.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-semibold">{row.promotions?.title ?? "Promocion"}</p>
                      <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                        {row.status}
                      </span>
                      {row.cash_movement_id ? (
                        <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
                          En caja
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      {row.full_name} · {row.phone ?? "Sin celular"} · {row.email}
                      <br />
                      {row.city ?? "Sin ciudad"} · {formatDate(row.created_at)} · {row.wants_appointment ? "Quiere cita" : "No requiere cita"}
                      <br />
                      Total {formatMoney(row.total_amount)} · Pagado {formatMoney(row.amount_paid ?? 0)} · Pendiente {formatMoney(row.amount_pending ?? row.total_amount)}
                      <br />
                      {row.payment_mode === "anticipo" ? `Anticipo ${row.payment_percent}%` : "Pago completo"} {row.payment_method ? `· ${row.payment_method}` : ""}
                    </p>

                    <div className="mt-4 grid gap-2">
                      {items.map((item) => {
                        const remaining = Math.max(
                          Number(item.promotion_variants?.available_slots ?? 0) -
                            Number(item.promotion_variants?.approved_slots ?? 0),
                          0
                        );
                        const preferredSlot = getPromotionOrderItemPreferredSlot(item, row);

                        return (
                          <div key={item.id} className="rounded-[18px] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm">
                            <p className="font-semibold text-[var(--color-ink)]">{item.title_snapshot}</p>
                            <p className="mt-1 text-[var(--color-copy)]">
                              {formatMoney(item.unit_price)} · cantidad {item.quantity} · cupos restantes {remaining}
                            </p>
                            {preferredSlot ? (
                              <p className="mt-2 text-xs leading-5 text-[var(--color-copy)]">
                                {formatDate(preferredSlot.date)} · {preferredSlot.start_time?.slice(0, 5)} - {preferredSlot.end_time?.slice(0, 5)} · {preferredSlot.appointment_type ?? "Promocion directa"}
                                <br />
                                {preferredSlot.city ?? row.city ?? "Sin ciudad"} · {preferredSlot.appointment_reservation_id ? "Horario bloqueado al aprobar." : "Se bloquea al aprobar."}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {row.payment_receipt_path ? (
                      <button onClick={() => void openReceipt(row.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        Ver comprobante
                      </button>
                    ) : null}
                    <button onClick={() => void handleRevision(row)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      En revision
                    </button>
                    <button onClick={() => openApproval(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                      Aprobar y pasar a caja
                    </button>
                    <button onClick={() => void handleReject(row)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Rechazar
                    </button>
                    {approvedWhatsappHref ? (
                      <a href={approvedWhatsappHref} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        Enviar confirmado
                      </a>
                    ) : null}
                    {rejectedWhatsappHref ? (
                      <a href={rejectedWhatsappHref} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        Enviar rechazo
                      </a>
                    ) : null}
                    <DeleteActions
                      role={role}
                      row={row}
                      onSoftDelete={() => void softDeleteRecord({ table: "promotion_orders", id: row.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                      onRestore={() => void restoreRecord("promotion_orders", row.id).then(load)}
                      onHardDelete={() => void hardDeleteRecord("promotion_orders", row.id).then(load)}
                    />
                  </div>
                </div>

                <textarea
                  value={getRowNotes(row)}
                  onChange={(event) => setNotesDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                  onBlur={() => void saveNotes(row)}
                  className="premium-input mt-4 min-h-24"
                  placeholder="Notas internas. Si rechazas, aqui escribe el motivo que tambien se enviara por WhatsApp."
                />
                <DeletedStatusNote row={row} />
              </div>
            );
          })}
        </div>
      ) : null}

      {approvalDraft ? (
        <ModalShell title="Aprobar pedido de promocion" onClose={() => setApprovalDraft(null)}>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Pedido</p>
              <p className="mt-2 text-lg font-semibold">{approvalDraft.promotionTitle}</p>
              <p className="mt-1 text-sm text-[var(--color-copy)]">{approvalDraft.itemsLabel}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto aprobado">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(approvalDraft.amount)}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, amount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>
              <Field label="Metodo de pago">
                <select
                  value={approvalDraft.paymentMethod}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, paymentMethod: event.target.value })}
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
            <Field label="Notas administrativas">
              <textarea value={approvalDraft.notes} onChange={(event) => setApprovalDraft({ ...approvalDraft, notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void handleApprove()} disabled={savingApproval} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingApproval ? "Guardando..." : "Aprobar, caja y WhatsApp"}
            </button>
            <button onClick={() => setApprovalDraft(null)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function buildPromotionOrderWhatsappHref(row: PromotionOrderRow) {
  const phone = (row.phone ?? "").replace(/\D/g, "");
  if (!phone) return null;

  const patientName = row.full_name?.trim() || "hola";
  const promotionTitle = row.promotions?.title ?? "tu promocion";
  const itemTitles = getPromotionOrderItems(row)
    .map((item) => item.title_snapshot)
    .filter(Boolean)
    .join(", ");

  if (row.status === "Aprobado") {
    return `https://wa.me/${phone}?text=${encodeURIComponent(
      `Hola ${patientName}, tu pago y tu tratamiento/promocion ya fueron confirmados para "${promotionTitle}". Opciones: ${itemTitles || "seleccionadas"}. Ingresa a tu plataforma para revisar tus detalles y proximos pasos.`
    )}`;
  }

  if (row.status === "Rechazado") {
    return `https://wa.me/${phone}?text=${encodeURIComponent(
      `Hola ${patientName}, revisamos tu solicitud de "${promotionTitle}" pero no pudimos aprobar el pago todavia. Motivo: ${row.admin_notes?.trim() || "por favor comunicate con administracion para revisar tu comprobante"}.`
    )}`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    `Hola ${patientName}, te escribimos de parte de la Dra. sobre tu pedido de promocion "${promotionTitle}".`
  )}`;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Promociones</p>
            <h2 className="font-display mt-2 text-4xl font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
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
