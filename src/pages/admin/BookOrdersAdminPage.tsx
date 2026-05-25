import { useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import {
  getBookOrdersAdmin,
  updateBookOrderNotes,
  updateBookOrderStatus,
  verifyBookOrder,
  type BookOrderRow,
} from "../../services/bookOrderService";
import {
  deactivateToken,
  generateBookToken,
  getAllTokensAdmin,
  getTokensByOrder,
  updateBookToken,
  type BookTokenRow,
} from "../../services/bookTokenService";
import { getSignedUrl } from "../../services/storageService";
import { formatDate, formatMoney } from "../../utils/text";

const bucket = "payment-receipts-private";

type ApprovalDraft = {
  orderId: string;
  title: string;
  amount: number;
  paymentMethod: string;
  notes: string;
};

export function BookOrdersAdminPage() {
  const [rows, setRows] = useState<BookOrderRow[]>([]);
  const [tokens, setTokens] = useState<BookTokenRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [nextRows, nextTokens, nextMethods] = await Promise.all([getBookOrdersAdmin(), getAllTokensAdmin(), getCashPaymentMethods(true)]);
      setRows(nextRows);
      setTokens(nextTokens);
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
        const queryOk = JSON.stringify([row.full_name, row.document_number, row.email, row.phone, row.books?.title]).toLowerCase().includes(query.toLowerCase());
        return statusOk && queryOk;
      }),
    [query, rows, statusFilter]
  );

  const openReceipt = async (path?: string | null) => {
    if (!path) return;
    const url = await getSignedUrl(bucket, path);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyMessage = async (row: BookOrderRow) => {
    const orderTokens = await getTokensByOrder(row.id);
    const token = orderTokens[0]?.token ?? "TOKEN-PENDIENTE";
    const message = `Hola ${row.full_name}, verificamos correctamente tu pago del libro "${row.books?.title ?? "Libro"}".\nTu token de descarga es: ${token}\nPuedes descargarlo desde tu panel en la seccion de descargas o desde la pagina publica del libro en la opcion de ingresar token.\nSi luego te registras con el mismo carnet, esta compra tambien quedara vinculada a tu cuenta.\nGracias por tu compra.`;
    await navigator.clipboard.writeText(message);
  };

  const openApproval = (row: BookOrderRow) => {
    setApprovalDraft({
      orderId: row.id,
      title: row.books?.title ?? "Libro",
      amount: Number(row.payment_amount ?? row.books?.price ?? 0),
      paymentMethod: row.payment_method ?? paymentMethods.find((method) => method.is_default)?.code ?? "qr",
      notes: row.admin_notes ?? "",
    });
  };

  const approveOrder = async () => {
    if (!approvalDraft || approvalDraft.amount <= 0) return;
    setSavingApproval(true);
    try {
      await verifyBookOrder(approvalDraft.orderId, {
        adminNotes: approvalDraft.notes,
        paymentAmount: approvalDraft.amount,
        paymentMethod: approvalDraft.paymentMethod,
      });
      const token = await generateBookToken(approvalDraft.orderId);
      setGeneratedToken(token.token);
      setApprovalDraft(null);
      await load();
    } finally {
      setSavingApproval(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Libros</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">Pedidos, pagos y tokens</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
          Cuando un pedido se aprueba, el pago queda ligado al libro, al metodo y a caja antes de generar el token.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar comprador, libro, carnet o correo" className="premium-input" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
            <option>Todos</option>
            <option>Pendiente</option>
            <option>En revision</option>
            <option>Aprobado</option>
            <option>Rechazado</option>
          </select>
        </div>
        {generatedToken ? (
          <div className="mt-5 rounded-[20px] bg-[rgba(111,122,96,0.12)] p-4 text-sm text-[var(--color-copy)]">
            Token generado: <strong>{generatedToken}</strong>
          </div>
        ) : null}
      </section>

      {loading ? <LoadingState label="Cargando pedidos..." /> : null}
      {error ? <ErrorState label="No pudimos cargar los pedidos de libros." /> : null}
      {!loading && !error && filtered.length === 0 ? <EmptyState label="No hay pedidos para esos filtros." /> : null}

      {!loading && !error && filtered.length > 0 ? (
        <div className="grid gap-4">
          {filtered.map((row) => (
            <div key={row.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lg font-semibold">{row.books?.title ?? "Libro"}</p>
                    <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{row.status}</span>
                    {row.cash_movement_id ? <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">En caja</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    {row.full_name} - {row.phone ?? "Sin celular"} - {row.email}
                    <br />
                    CI {row.document_number ?? "sin carnet"}
                    <br />
                    {row.city ?? "Sin ciudad"} - {formatDate(row.created_at)}
                    <br />
                    {row.payment_amount ? `${formatMoney(row.payment_amount)} - ${row.payment_method ?? "sin metodo"}` : row.books?.price ? `Precio base ${formatMoney(row.books.price)}` : "Sin monto"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void openReceipt(row.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Ver comprobante
                  </button>
                  <button onClick={() => void updateBookOrderStatus(row.id, "En revision").then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    En revision
                  </button>
                  <button onClick={() => openApproval(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                    Aprobar y generar token
                  </button>
                  <button onClick={() => void updateBookOrderStatus(row.id, "Rechazado").then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Rechazar
                  </button>
                  <button onClick={() => void copyMessage(row)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Copiar mensaje
                  </button>
                  <a href={`https://wa.me/${(row.phone ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Abrir WhatsApp
                  </a>
                </div>
              </div>

              <textarea
                defaultValue={row.admin_notes ?? ""}
                onBlur={(event) => void updateBookOrderNotes(row.id, event.target.value)}
                className="premium-input mt-4 min-h-24"
                placeholder="Notas internas"
              />
            </div>
          ))}
        </div>
      ) : null}

      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Tokens activos</p>
        <h2 className="font-display mt-3 text-4xl font-semibold">Control de accesos de descarga</h2>

        {!loading && !error && tokens.length === 0 ? <EmptyState label="Todavia no hay tokens creados." /> : null}

        {!loading && !error && tokens.length > 0 ? (
          <div className="mt-6 grid gap-4">
            {tokens.map((row) => (
              <div key={row.id} className="rounded-[26px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold">{row.books?.title ?? "Libro"}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-copy)]">{row.token}</p>
                    <p className="mt-2 text-sm text-[var(--color-copy)]">
                      Usos {row.used_count}/{row.max_uses} - {row.is_active ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      defaultValue={row.max_uses}
                      onBlur={(event) => void updateBookToken(row.id, { max_uses: Number(event.target.value) }).then(load)}
                      className="premium-input w-28"
                    />
                    <input
                      type="datetime-local"
                      defaultValue={row.expires_at?.slice(0, 16) ?? ""}
                      onBlur={(event) => void updateBookToken(row.id, { expires_at: event.target.value || null }).then(load)}
                      className="premium-input"
                    />
                    <button onClick={() => void navigator.clipboard.writeText(row.token)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Copiar token
                    </button>
                    <button onClick={() => void updateBookToken(row.id, { is_active: !row.is_active }).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      {row.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => void deactivateToken(row.id).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Revocar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {approvalDraft ? (
        <ModalShell title="Aprobar pedido de libro" onClose={() => setApprovalDraft(null)}>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Pedido</p>
              <p className="mt-2 text-lg font-semibold">{approvalDraft.title}</p>
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
            <button onClick={() => void approveOrder()} disabled={savingApproval} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingApproval ? "Guardando..." : "Aprobar, caja y token"}
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Libros</p>
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
