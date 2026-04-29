import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getSignedUrl } from "../../services/storageService";
import {
  getBookOrdersAdmin,
  updateBookOrderNotes,
  updateBookOrderStatus,
  verifyBookOrder,
  type BookOrderRow,
} from "../../services/bookOrderService";
import { generateBookToken, getTokensByOrder } from "../../services/bookTokenService";
import { formatDate } from "../../utils/text";

const bucket = "payment-receipts-private";

export function BookOrdersAdminPage() {
  const [rows, setRows] = useState<BookOrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await getBookOrdersAdmin());
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
        const queryOk = JSON.stringify([row.full_name, row.email, row.phone, row.books?.title]).toLowerCase().includes(query.toLowerCase());
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
    const tokens = await getTokensByOrder(row.id);
    const token = tokens[0]?.token ?? "TOKEN-PENDIENTE";
    const message = `Hola ${row.full_name}, gracias por tu compra. Verificamos correctamente tu pago del libro "${row.books?.title ?? "Libro"}".\nTu token de descarga es: ${token}\nIngresa a tu panel en la seccion de descargas para obtener el libro.\nGracias por tu compra.`;
    await navigator.clipboard.writeText(message);
  };

  const approveOrder = async (row: BookOrderRow) => {
    await verifyBookOrder(row.id, row.admin_notes ?? "");
    const token = await generateBookToken(row.id);
    setGeneratedToken(token.token);
    await load();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Pedidos de libros</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">Revision de comprobantes y aprobaciones</h1>
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar comprador, libro o correo" className="premium-input" />
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

      {loading && <LoadingState label="Cargando pedidos..." />}
      {error && <ErrorState label="No pudimos cargar los pedidos de libros." />}
      {!loading && !error && filtered.length === 0 && <EmptyState label="No hay pedidos para esos filtros." />}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4">
          {filtered.map((row) => (
            <div key={row.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lg font-semibold">{row.books?.title ?? "Libro"}</p>
                    <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    {row.full_name} · {row.phone ?? "Sin celular"} · {row.email}
                    <br />
                    {row.city ?? "Sin ciudad"} · {formatDate(row.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void openReceipt(row.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Ver comprobante
                  </button>
                  <button onClick={() => void updateBookOrderStatus(row.id, "En revision").then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    En revision
                  </button>
                  <button onClick={() => void approveOrder(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
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
      )}
    </div>
  );
}
