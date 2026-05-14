import { useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import {
  approvePromotionOrder,
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
  const [rows, setRows] = useState<PromotionOrderRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [nextRows, nextMethods] = await Promise.all([
        getPromotionOrdersAdmin(),
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
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const statusOk = statusFilter === "Todos" || row.status === statusFilter;
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
        return statusOk && queryOk;
      }),
    [query, rows, statusFilter]
  );

  const openReceipt = async (path?: string | null) => {
    const url = await getPromotionOrderReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
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
      notes: row.admin_notes ?? "",
    });
  };

  const handleApprove = async () => {
    if (!approvalDraft || approvalDraft.amount <= 0) return;
    setSavingApproval(true);
    try {
      await approvePromotionOrder(approvalDraft.orderId, {
        adminNotes: approvalDraft.notes,
        paymentAmount: approvalDraft.amount,
        paymentMethod: approvalDraft.paymentMethod,
      });
      setApprovalDraft(null);
      await load();
    } finally {
      setSavingApproval(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Promociones</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">Pedidos, anticipos y cupos</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
          Cada aprobacion registra el ingreso en caja y descuenta los cupos de cada opcion elegida.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
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
        </div>
      </section>

      {loading ? <LoadingState label="Cargando pedidos de promociones..." /> : null}
      {error ? <ErrorState label="No pudimos cargar los pedidos de promociones." /> : null}
      {!loading && !error && filtered.length === 0 ? <EmptyState label="No hay pedidos para esos filtros." /> : null}

      {!loading && !error && filtered.length > 0 ? (
        <div className="grid gap-4">
          {filtered.map((row) => {
            const items = getPromotionOrderItems(row);

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
                        return (
                          <div key={item.id} className="rounded-[18px] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm">
                            <p className="font-semibold text-[var(--color-ink)]">{item.title_snapshot}</p>
                            <p className="mt-1 text-[var(--color-copy)]">
                              {formatMoney(item.unit_price)} · cantidad {item.quantity} · cupos restantes {remaining}
                            </p>
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
                    <button onClick={() => void updatePromotionOrderStatus(row.id, "En revision", row.admin_notes).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      En revision
                    </button>
                    <button onClick={() => openApproval(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                      Aprobar y pasar a caja
                    </button>
                    <button onClick={() => void updatePromotionOrderStatus(row.id, "Rechazado", row.admin_notes).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Rechazar
                    </button>
                    <a href={`https://wa.me/${(row.phone ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Abrir WhatsApp
                    </a>
                  </div>
                </div>

                <textarea
                  defaultValue={row.admin_notes ?? ""}
                  onBlur={(event) => void updatePromotionOrderNotes(row.id, event.target.value)}
                  className="premium-input mt-4 min-h-24"
                  placeholder="Notas internas"
                />
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
                <input type="number" min={0} step="0.01" value={String(approvalDraft.amount)} onChange={(event) => setApprovalDraft({ ...approvalDraft, amount: Number(event.target.value) })} className="premium-input" />
              </Field>
              <Field label="Metodo de pago">
                <select value={approvalDraft.paymentMethod} onChange={(event) => setApprovalDraft({ ...approvalDraft, paymentMethod: event.target.value })} className="premium-input">
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
              {savingApproval ? "Guardando..." : "Aprobar, caja y cupos"}
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
