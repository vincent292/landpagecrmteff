import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, PackageCheck, Plus, X } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../common/AsyncState";
import type { InventoryItemRow, InventoryLocationRow, InventorySupplierRow, InventoryUnitRow } from "../../services/inventoryService";
import {
  getInventorySupplierOrders,
  receiveInventorySupplierOrder,
  saveInventorySupplierOrder,
  type SupplierOrderKind,
  type SupplierOrderRow,
} from "../../services/supplierOrderService";
import { formatDate, formatMoney } from "../../utils/text";

type OrderLineDraft = {
  id: string;
  item_id: string;
  quantity: number;
  cost: number;
  lot_number: string;
  expiration_date: string;
};

type Props = {
  actorId?: string | null;
  suppliers: InventorySupplierRow[];
  items: InventoryItemRow[];
  locations: InventoryLocationRow[];
  units: InventoryUnitRow[];
  onInventoryRefresh: () => void;
  onNewSupplier: () => void;
  onNotice: (notice: { type: "success" | "error"; text: string }) => void;
};

export function InventorySimpleOrdersPanel({ actorId, suppliers, items, locations, units, onInventoryRefresh, onNewSupplier, onNotice }: Props) {
  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [kind, setKind] = useState<SupplierOrderKind>("compra");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);
  const unitMap = useMemo(() => new Map(units.map((row) => [row.id, row])), [units]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setOrders(await getInventorySupplierOrders(false));
    } catch (loadError) {
      console.error("Error cargando pedidos simples", loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const openNew = () => {
    if (suppliers.length === 0) {
      onNotice({ type: "error", text: "Primero agrega un proveedor." });
      onNewSupplier();
      return;
    }
    setSupplierId(suppliers[0]?.id ?? "");
    setKind(suppliers[0]?.allows_consignment ? "consignacion" : "compra");
    setNotes("");
    setLines([emptyLine()]);
    setShowModal(true);
  };

  const save = async () => {
    if (!supplierId) return onNotice({ type: "error", text: "Selecciona un proveedor." });
    const validLines = lines.filter((line) => line.item_id && Number(line.quantity) > 0);
    if (validLines.length === 0) return onNotice({ type: "error", text: "Agrega al menos un producto y su cantidad." });
    setSaving(true);
    try {
      await saveInventorySupplierOrder({
        supplier_id: supplierId,
        location_id: locations[0]?.id ?? null,
        status: "pedido",
        order_kind: kind,
        requested_at: new Date().toISOString(),
        notes: notes.trim() || null,
        created_by: actorId,
        updated_by: actorId,
        items: validLines.map((line) => {
          const item = items.find((row) => row.id === line.item_id);
          const factor = item?.presentation_unit_id && Number(item.units_per_presentation) > 1 ? Number(item.units_per_presentation) : 1;
          return {
            item_id: line.item_id,
            quantity_requested: Number(line.quantity) * factor,
            quantity_received: 0,
            unit_cost: Number(line.cost) > 0 ? Number(line.cost) / factor : 0,
            lot_number: line.lot_number.trim() || null,
            expiration_date: line.expiration_date || null,
            notes: null,
          };
        }),
      });
      setShowModal(false);
      onNotice({ type: "success", text: "Pedido guardado como pendiente de recepción." });
      await load();
    } catch (saveError) {
      onNotice({ type: "error", text: errorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  };

  const receiveAll = async (order: SupplierOrderRow) => {
    if (!window.confirm("¿Confirmas que recibiste todos los productos de este pedido? El stock se actualizará ahora.")) return;
    setSaving(true);
    try {
      const fullOrder = await saveInventorySupplierOrder({
        orderId: order.id,
        supplier_id: order.supplier_id,
        location_id: order.location_id,
        status: "pedido",
        order_kind: order.order_kind,
        city: order.city,
        order_number: order.order_number,
        invoice_number: order.invoice_number,
        requested_at: order.requested_at,
        due_date: order.due_date,
        notes: order.notes,
        whatsapp_message: order.whatsapp_message,
        sent_to_supplier_at: order.sent_to_supplier_at,
        document_path: order.document_path,
        updated_by: actorId,
        items: (order.inventory_supplier_order_items ?? []).map((line) => ({
          item_id: line.item_id,
          quantity_requested: Number(line.quantity_requested),
          quantity_received: Number(line.quantity_requested),
          unit_cost: Number(line.unit_cost),
          lot_number: line.lot_number,
          expiration_date: line.expiration_date,
          notes: line.notes,
          status: "pendiente",
        })),
      });
      await receiveInventorySupplierOrder(fullOrder.id);
      onNotice({ type: "success", text: "Pedido recibido y stock actualizado." });
      await Promise.all([load(), onInventoryRefresh()]);
    } catch (receiveError) {
      onNotice({ type: "error", text: errorMessage(receiveError) });
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsApp = (order: SupplierOrderRow) => {
    const supplier = order.inventory_suppliers;
    const phone = String(supplier?.whatsapp_phone || supplier?.phone || "").replace(/\D/g, "");
    if (!phone) return onNotice({ type: "error", text: "Este proveedor no tiene número de WhatsApp." });
    const detail = (order.inventory_supplier_order_items ?? []).map((line) => `• ${line.inventory_items?.name ?? "Producto"}: ${formatOrderQuantity(line.quantity_requested, line.item_id, items, unitMap)}`).join("\n");
    const message = `Hola ${supplier?.contact_name || supplier?.name || ""}, solicitamos:\n${detail}\nGracias.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingState label="Cargando pedidos..." />;
  if (error) return <ErrorState label="No pudimos cargar los pedidos." />;

  const pending = orders.filter((row) => row.status === "pedido" || row.status === "borrador");
  const consignment = orders.filter((row) => row.order_kind === "consignacion" && row.status !== "cancelado");
  const received = orders.filter((row) => row.status === "recibido");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Por recibir" value={String(pending.length)} />
        <Metric label="Consignación" value={String(consignment.length)} />
        <Metric label="Recibidos" value={String(received.length)} />
      </div>

      <section className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Pedidos actuales</h2><p className="mt-1 text-sm text-[var(--color-copy)]">Crea el pedido y, cuando llegue completo, toca Recibir.</p></div>
          <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nuevo pedido</button>
        </div>
        <div className="mt-5 grid gap-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-[20px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2"><Tag text={statusLabel(order.status)} /><Tag text={order.order_kind === "consignacion" ? "Consignación" : order.order_kind === "credito" ? "Crédito" : "Compra"} /></div>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{order.inventory_suppliers?.name ?? "Proveedor"}</h3>
                  <p className="mt-1 text-sm text-[var(--color-copy)]">Solicitado {formatDate(order.requested_at)} · {formatMoney(order.subtotal_amount)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{(order.inventory_supplier_order_items ?? []).map((line) => <span key={line.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">{line.inventory_items?.name ?? "Producto"}: {formatOrderQuantity(line.quantity_requested, line.item_id, items, unitMap)}</span>)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => sendWhatsApp(order)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
                  {order.status === "pedido" || order.status === "borrador" ? <button onClick={() => void receiveAll(order)} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><PackageCheck className="h-4 w-4" /> Recibir</button> : <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Recibido</span>}
                </div>
              </div>
            </article>
          ))}
          {orders.length === 0 ? <EmptyState label="Todavía no hay pedidos. Agrega un proveedor y crea el primero." /> : null}
        </div>
      </section>

      {showModal ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModal(false); }}>
          <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-[28px] bg-[var(--color-cream)] p-5 sm:rounded-[28px] sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-semibold">Nuevo pedido</h2><button onClick={() => setShowModal(false)} className="rounded-full border border-[var(--color-border)] bg-white p-2"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Proveedor"><select value={supplierId} onChange={(event) => { const id = event.target.value; setSupplierId(id); const supplier = suppliers.find((row) => row.id === id); if (supplier?.allows_consignment) setKind("consignacion"); }} className="premium-input">{suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
              <Field label="Tipo"><select value={kind} onChange={(event) => setKind(event.target.value as SupplierOrderKind)} className="premium-input"><option value="compra">Pedido normal</option><option value="consignacion">Consignación</option><option value="credito">Compra a crédito</option></select></Field>
            </div>
            <div className="mt-5 grid gap-3">
              {lines.map((line) => {
                const item = items.find((row) => row.id === line.item_id);
                const presentation = presentationLabel(item, unitMap);
                return <div key={line.id} className="rounded-[18px] border border-[var(--color-border)] bg-white/75 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Producto"><select value={line.item_id} onChange={(event) => patchLine(setLines, line.id, { item_id: event.target.value })} className="premium-input"><option value="">Selecciona</option>{items.slice().sort((a,b) => a.name.localeCompare(b.name)).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
                  <Field label={`Cantidad (${presentation})`}><input type="number" min="0.01" step="0.01" value={String(line.quantity)} onChange={(event) => patchLine(setLines, line.id, { quantity: Number(event.target.value) })} className="premium-input" /></Field>
                  <Field label={`Costo por ${presentation}`}><input type="number" min="0" step="0.01" value={String(line.cost)} onChange={(event) => patchLine(setLines, line.id, { cost: Number(event.target.value) })} className="premium-input" /></Field>
                  <Field label="Lote (opcional)"><input value={line.lot_number} onChange={(event) => patchLine(setLines, line.id, { lot_number: event.target.value })} className="premium-input" /></Field>
                  <Field label="Vencimiento"><input type="date" value={line.expiration_date} onChange={(event) => patchLine(setLines, line.id, { expiration_date: event.target.value })} className="premium-input" /></Field>
                </div><button onClick={() => setLines((current) => current.filter((row) => row.id !== line.id))} className="mt-3 text-xs font-semibold text-red-700">Quitar producto</button></div>;
              })}
              <button onClick={() => setLines((current) => [...current, emptyLine()])} className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Agregar producto</button>
              <Field label="Nota (opcional)"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="premium-input min-h-20" /></Field>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => setShowModal(false)} className="rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-semibold">Cancelar</button><button onClick={() => void save()} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar pedido"}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-[var(--color-border)] bg-white/80 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-copy)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p></div>;
}

function Tag({ text }: { text: string }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">{text}</span>;
}

function emptyLine(): OrderLineDraft {
  return { id: crypto.randomUUID(), item_id: "", quantity: 1, cost: 0, lot_number: "", expiration_date: "" };
}

function patchLine(setLines: React.Dispatch<React.SetStateAction<OrderLineDraft[]>>, id: string, patch: Partial<OrderLineDraft>) {
  setLines((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
}

function presentationLabel(item: InventoryItemRow | undefined, unitMap: Map<string, InventoryUnitRow>) {
  if (item?.presentation_unit_id && Number(item.units_per_presentation) > 1) return unitMap.get(item.presentation_unit_id)?.abbreviation ?? "envase";
  return unitMap.get(item?.unit_id ?? "")?.abbreviation ?? item?.unit ?? "u";
}

function formatOrderQuantity(value: number, itemId: string, items: InventoryItemRow[], unitMap: Map<string, InventoryUnitRow>) {
  const item = items.find((row) => row.id === itemId);
  const factor = item?.presentation_unit_id && Number(item.units_per_presentation) > 1 ? Number(item.units_per_presentation) : 1;
  const quantity = Number(value) / factor;
  return `${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(quantity)} ${presentationLabel(item, unitMap)}`;
}

function statusLabel(status: SupplierOrderRow["status"]) {
  return { borrador: "Por pedir", pedido: "Por recibir", recibido: "Recibido", cancelado: "Cancelado" }[status];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar el pedido.";
}
