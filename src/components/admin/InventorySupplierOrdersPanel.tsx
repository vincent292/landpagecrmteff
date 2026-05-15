import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, Download, MessageCircle, PackagePlus, Pencil, Plus, Receipt, ShoppingCart } from "lucide-react";

import { DeleteActions, DeletedStatusNote } from "./DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import type { InventoryItemRow, InventoryLocationRow, InventorySupplierRow } from "../../services/inventoryService";
import {
  getInventorySupplierOrders,
  getSupplierOrderDocumentUrl,
  receiveInventorySupplierOrder,
  registerInventorySupplierOrderPayment,
  saveInventorySupplierOrder,
  uploadSupplierOrderDocument,
  type SupplierOrderKind,
  type SupplierOrderRow,
  type SupplierOrderStatus,
} from "../../services/supplierOrderService";
import type { UserRole } from "../../types/platform";
import { downloadCsv } from "../../utils/csv";
import { formatDate, formatMoney } from "../../utils/text";

type Props = {
  role: UserRole;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  includeDeleted: boolean;
  suppliers: InventorySupplierRow[];
  items: InventoryItemRow[];
  locations: InventoryLocationRow[];
  onInventoryRefresh: () => void;
};

type OrderLineForm = {
  local_id: string;
  item_id: string;
  quantity_requested: number;
  quantity_received: number;
  unit_cost: number;
  lot_number: string;
  expiration_date: string;
  notes: string;
};

type OrderFormState = {
  supplier_id: string;
  location_id: string;
  status: SupplierOrderStatus;
  order_kind: SupplierOrderKind;
  city: string;
  order_number: string;
  invoice_number: string;
  requested_at: string;
  due_date: string;
  notes: string;
  lines: OrderLineForm[];
};

type PaymentFormState = {
  amount: number;
  payment_method: string;
  payment_date: string;
  reference: string;
  notes: string;
};

const emptyOrderLine = (): OrderLineForm => ({
  local_id: crypto.randomUUID(),
  item_id: "",
  quantity_requested: 1,
  quantity_received: 0,
  unit_cost: 0,
  lot_number: "",
  expiration_date: "",
  notes: "",
});

const emptyOrderForm = (): OrderFormState => ({
  supplier_id: "",
  location_id: "",
  status: "pedido",
  order_kind: "compra",
  city: "",
  order_number: "",
  invoice_number: "",
  requested_at: new Date().toISOString().slice(0, 10),
  due_date: "",
  notes: "",
  lines: [emptyOrderLine()],
});

const emptyPaymentForm = (): PaymentFormState => ({
  amount: 0,
  payment_method: "efectivo",
  payment_date: new Date().toISOString().slice(0, 10),
  reference: "",
  notes: "",
});

export function InventorySupplierOrdersPanel({
  role,
  actorId,
  actorName,
  actorEmail,
  includeDeleted,
  suppliers,
  items,
  locations,
  onInventoryRefresh,
}: Props) {
  const [orders, setOrders] = useState<SupplierOrderRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [kindFilter, setKindFilter] = useState("Todos");
  const [paymentFilter, setPaymentFilter] = useState("Todos");
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SupplierOrderRow | null>(null);
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<SupplierOrderRow | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm);
  const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);

  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      getInventorySupplierOrders(includeDeleted),
      getCashPaymentMethods(true),
    ])
      .then(([orderRows, methodRows]) => {
        setOrders(orderRows);
        setPaymentMethods(methodRows);
      })
      .catch((loadError) => {
        console.error("Error cargando pedidos a proveedores", loadError);
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [includeDeleted]);

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.is_deleted &&
          item.supplier_id &&
          Number(item.current_stock ?? 0) <= Number(item.minimum_stock ?? 0)
      ),
    [items]
  );

  const lowStockBySupplier = useMemo(() => {
    const grouped = new Map<string, InventoryItemRow[]>();
    lowStockItems.forEach((item) => {
      const bucket = grouped.get(item.supplier_id ?? "") ?? [];
      bucket.push(item);
      grouped.set(item.supplier_id ?? "", bucket);
    });
    return Array.from(grouped.entries())
      .map(([supplierId, rows]) => ({
        supplierId,
        supplier: supplierMap.get(supplierId) ?? null,
        rows,
      }))
      .filter((entry) => entry.supplier);
  }, [lowStockItems, supplierMap]);

  const filteredOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery =
        !search ||
        JSON.stringify([
          order.inventory_suppliers?.name,
          order.order_number,
          order.invoice_number,
          order.city,
          order.notes,
          order.whatsapp_message,
          ...(order.inventory_supplier_order_items ?? []).map((line) => line.inventory_items?.name ?? ""),
        ])
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "Todos" || order.status === statusFilter;
      const matchesKind = kindFilter === "Todos" || order.order_kind === kindFilter;
      const matchesPayment = paymentFilter === "Todos" || order.payment_status === paymentFilter;
      return matchesQuery && matchesStatus && matchesKind && matchesPayment;
    });
  }, [kindFilter, orders, paymentFilter, query, statusFilter]);

  const totalPending = filteredOrders.reduce((sum, order) => sum + Number(order.amount_pending ?? 0), 0);
  const totalCommitted = filteredOrders.reduce((sum, order) => sum + Number(order.subtotal_amount ?? 0), 0);
  const totalPaid = filteredOrders.reduce((sum, order) => sum + Number(order.amount_paid ?? 0), 0);

  const openNewOrder = (prefillSupplierId?: string, prefillItems?: InventoryItemRow[]) => {
    const supplier = prefillSupplierId ? supplierMap.get(prefillSupplierId) : null;
    setEditingOrder(null);
    setDocumentFile(null);
    setOrderForm({
      supplier_id: prefillSupplierId ?? "",
      location_id: prefillItems?.[0]?.location_id ?? "",
      status: "pedido",
      order_kind: supplier?.allows_consignment ? "consignacion" : "compra",
      city: prefillItems?.[0]?.city ?? "",
      order_number: "",
      invoice_number: "",
      requested_at: new Date().toISOString().slice(0, 10),
      due_date:
        supplier?.payment_terms_days && supplier.payment_terms_days > 0
          ? addDays(new Date(), supplier.payment_terms_days).toISOString().slice(0, 10)
          : "",
      notes: "",
      lines:
        prefillItems && prefillItems.length > 0
          ? prefillItems.map((item) => ({
              local_id: crypto.randomUUID(),
              item_id: item.id,
              quantity_requested: Math.max(Number(item.minimum_stock ?? 0) - Number(item.current_stock ?? 0), 1),
              quantity_received: 0,
              unit_cost: Number(item.reference_cost ?? 0),
              lot_number: "",
              expiration_date: "",
              notes: "",
            }))
          : [emptyOrderLine()],
    });
    setShowOrderModal(true);
  };

  const openEditOrder = (order: SupplierOrderRow) => {
    setEditingOrder(order);
    setDocumentFile(null);
    setOrderForm({
      supplier_id: order.supplier_id,
      location_id: order.location_id ?? "",
      status: order.status,
      order_kind: order.order_kind,
      city: order.city ?? "",
      order_number: order.order_number ?? "",
      invoice_number: order.invoice_number ?? "",
      requested_at: order.requested_at.slice(0, 10),
      due_date: order.due_date ?? "",
      notes: order.notes ?? "",
      lines: (order.inventory_supplier_order_items ?? []).map((line) => ({
        local_id: line.id,
        item_id: line.item_id,
        quantity_requested: Number(line.quantity_requested ?? 0),
        quantity_received: Number(line.quantity_received ?? 0),
        unit_cost: Number(line.unit_cost ?? 0),
        lot_number: line.lot_number ?? "",
        expiration_date: line.expiration_date ?? "",
        notes: line.notes ?? "",
      })),
    });
    setShowOrderModal(true);
  };

  const closeOrderModal = () => {
    setEditingOrder(null);
    setDocumentFile(null);
    setOrderForm(emptyOrderForm());
    setShowOrderModal(false);
  };

  const closePaymentModal = () => {
    setPaymentOrder(null);
    setPaymentReceiptFile(null);
    setPaymentForm(emptyPaymentForm());
  };

  const openPaymentModal = (order: SupplierOrderRow) => {
    setPaymentOrder(order);
    setPaymentReceiptFile(null);
    setPaymentForm({
      amount: Number(order.amount_pending ?? order.subtotal_amount ?? 0),
      payment_method: paymentMethods.find((method) => method.is_default)?.code ?? paymentMethods[0]?.code ?? "efectivo",
      payment_date: new Date().toISOString().slice(0, 10),
      reference: order.invoice_number ?? order.order_number ?? "",
      notes: "",
    });
  };

  const addLine = () => setOrderForm((current) => ({ ...current, lines: [...current.lines, emptyOrderLine()] }));

  const updateLine = (localId: string, patch: Partial<OrderLineForm>) =>
    setOrderForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.local_id === localId ? { ...line, ...patch } : line)),
    }));

  const removeLine = (localId: string) =>
    setOrderForm((current) => ({
      ...current,
      lines: current.lines.length === 1 ? current.lines : current.lines.filter((line) => line.local_id !== localId),
    }));

  const orderEstimate = orderForm.lines.reduce(
    (sum, line) => sum + Number(line.quantity_requested || 0) * Number(line.unit_cost || 0),
    0
  );

  const submitOrder = async (options?: { sendWhatsapp?: boolean; receiveNow?: boolean }) => {
    setSaving(true);
    try {
      const supplier = supplierMap.get(orderForm.supplier_id);
      const whatsappMessage = buildWhatsAppMessage(orderForm, supplier ?? null, itemMap);
      const nextDocumentPath =
        documentFile != null
          ? await uploadSupplierOrderDocument(documentFile, editingOrder?.id ?? crypto.randomUUID())
          : editingOrder?.document_path ?? null;

      const savedOrder = await saveInventorySupplierOrder({
        orderId: editingOrder?.id ?? null,
        supplier_id: orderForm.supplier_id,
        location_id: orderForm.location_id,
        status: options?.receiveNow ? "pedido" : orderForm.status,
        order_kind: orderForm.order_kind,
        city: orderForm.city,
        order_number: orderForm.order_number,
        invoice_number: orderForm.invoice_number,
        requested_at: orderForm.requested_at,
        due_date: orderForm.due_date,
        notes: orderForm.notes,
        whatsapp_message: options?.sendWhatsapp ? whatsappMessage : editingOrder?.whatsapp_message ?? null,
        sent_to_supplier_at: options?.sendWhatsapp ? new Date().toISOString() : editingOrder?.sent_to_supplier_at ?? null,
        document_path: nextDocumentPath,
        created_by: actorId,
        updated_by: actorId,
        items: orderForm.lines
          .filter((line) => line.item_id)
          .map((line) => ({
            item_id: line.item_id,
            quantity_requested: Number(line.quantity_requested),
            quantity_received: Number(line.quantity_received),
            unit_cost: Number(line.unit_cost),
            lot_number: line.lot_number,
            expiration_date: line.expiration_date,
            notes: line.notes,
          })),
      });

      if (options?.receiveNow) {
        await receiveInventorySupplierOrder(savedOrder.id);
        onInventoryRefresh();
      }

      if (options?.sendWhatsapp) {
        const phone = normalizePhoneForWhatsApp(supplier?.whatsapp_phone ?? supplier?.phone ?? "");
        if (phone) {
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
        }
      }

      closeOrderModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentOrder) return;
    setSaving(true);
    try {
      const receiptPath =
        paymentReceiptFile != null
          ? await uploadSupplierOrderDocument(paymentReceiptFile, paymentOrder.id)
          : null;

      await registerInventorySupplierOrderPayment({
        orderId: paymentOrder.id,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.payment_method,
        paymentDate: paymentForm.payment_date,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        receiptPath,
        city: paymentOrder.city ?? "",
      });

      closePaymentModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const openPrivatePath = async (path?: string | null) => {
    const url = await getSupplierOrderDocumentUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const exportOrders = () => {
    downloadCsv(
      `pedidos-proveedores-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredOrders.map((order) => ({
        proveedor: order.inventory_suppliers?.name ?? "",
        tipo: order.order_kind,
        estado: order.status,
        pago: order.payment_status,
        ciudad: order.city ?? "",
        pedido: order.order_number ?? "",
        factura: order.invoice_number ?? "",
        solicitado: order.requested_at,
        recibido: order.received_at ?? "",
        vence: order.due_date ?? "",
        subtotal: order.subtotal_amount,
        pagado: order.amount_paid,
        pendiente: order.amount_pending,
        items: (order.inventory_supplier_order_items ?? [])
          .map((line) => `${line.inventory_items?.name ?? "Item"} x ${line.quantity_requested}`)
          .join(" | "),
        notas: order.notes ?? "",
      }))
    );
  };

  const exportPayments = () => {
    downloadCsv(
      `pagos-proveedores-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredOrders.flatMap((order) =>
        (order.inventory_supplier_order_payments ?? []).map((payment) => ({
          proveedor: order.inventory_suppliers?.name ?? "",
          pedido: order.order_number ?? "",
          factura: order.invoice_number ?? "",
          fecha: payment.payment_date,
          monto: payment.amount,
          metodo: payment.payment_method,
          referencia: payment.reference ?? "",
          estado: payment.status,
          comprobante: payment.receipt_path ?? "",
        }))
      )
    );
  };

  const sendExistingOrderToWhatsApp = (order: SupplierOrderRow) => {
    const supplier = order.inventory_suppliers ?? supplierMap.get(order.supplier_id) ?? null;
    const phone = normalizePhoneForWhatsApp(supplier?.whatsapp_phone ?? supplier?.phone ?? "");
    if (!phone) return;
    const message = buildWhatsAppMessage(
      {
        supplier_id: order.supplier_id,
        location_id: order.location_id ?? "",
        status: order.status,
        order_kind: order.order_kind,
        city: order.city ?? "",
        order_number: order.order_number ?? "",
        invoice_number: order.invoice_number ?? "",
        requested_at: order.requested_at.slice(0, 10),
        due_date: order.due_date ?? "",
        notes: order.notes ?? "",
        lines: (order.inventory_supplier_order_items ?? []).map((line) => ({
          local_id: line.id,
          item_id: line.item_id,
          quantity_requested: Number(line.quantity_requested),
          quantity_received: Number(line.quantity_received),
          unit_cost: Number(line.unit_cost),
          lot_number: line.lot_number ?? "",
          expiration_date: line.expiration_date ?? "",
          notes: line.notes ?? "",
        })),
      },
      supplier,
      itemMap
    );
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingState label="Cargando pedidos a proveedores..." />;
  if (error) return <ErrorState label="No pudimos cargar pedidos, pagos y saldos de proveedores." />;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pedidos visibles" value={String(filteredOrders.length)} />
        <SummaryCard label="Comprometido" value={formatMoney(totalCommitted)} />
        <SummaryCard label="Pagado" value={formatMoney(totalPaid)} />
        <SummaryCard label="Pendiente" value={formatMoney(totalPending)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel
          eyebrow="Recompra"
          title="Stock bajo por proveedor"
          action={
            <button
              onClick={() => openNewOrder()}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Nuevo pedido
            </button>
          }
        >
          <RowsEmpty
            rows={lowStockBySupplier}
            empty="No hay items en stock bajo con proveedor asignado."
            render={(entry) => (
              <div key={entry.supplierId} className="rounded-[20px] border border-[var(--color-border)] bg-white/75 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-[var(--color-ink)]">{entry.supplier?.name}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                      {entry.rows.map((row) => `${row.name} (${row.current_stock}/${row.minimum_stock})`).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openNewOrder(entry.supplierId, entry.rows)}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Armar pedido
                    </button>
                    <button
                      onClick={() => {
                        openNewOrder(entry.supplierId, entry.rows);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-[rgba(110,74,47,0.92)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Pedir por WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
        </Panel>

        <Panel
          eyebrow="Reportes"
          title="Control de compras y pagos"
          action={
            <div className="flex flex-wrap gap-2">
              <button onClick={exportOrders} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                <Download className="h-4 w-4" />
                CSV pedidos
              </button>
              <button onClick={exportPayments} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                <Receipt className="h-4 w-4" />
                CSV pagos
              </button>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <InfoStat label="A credito / consignacion" value={String(filteredOrders.filter((row) => row.order_kind !== "compra").length)} />
            <InfoStat label="Con saldo pendiente" value={String(filteredOrders.filter((row) => Number(row.amount_pending ?? 0) > 0).length)} />
            <InfoStat label="Recibidos" value={String(filteredOrders.filter((row) => row.status === "recibido").length)} />
            <InfoStat label="Con comprobantes" value={String(filteredOrders.filter((row) => row.document_path || row.inventory_supplier_order_payments?.some((payment) => payment.receipt_path)).length)} />
          </div>
        </Panel>
      </section>

      <Panel
        eyebrow="Operativo"
        title="Pedidos a proveedores"
        action={
          <button
            onClick={() => openNewOrder()}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"
          >
            <PackagePlus className="h-4 w-4" />
            Nuevo pedido
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proveedor, pedido, factura o item" className="premium-input" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
            <option>Todos</option>
            <option value="borrador">borrador</option>
            <option value="pedido">pedido</option>
            <option value="recibido">recibido</option>
            <option value="cancelado">cancelado</option>
          </select>
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className="premium-input">
            <option>Todos</option>
            <option value="compra">compra</option>
            <option value="credito">credito</option>
            <option value="consignacion">consignacion</option>
          </select>
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="premium-input">
            <option>Todos</option>
            <option value="pendiente">pendiente</option>
            <option value="parcial">parcial</option>
            <option value="pagado">pagado</option>
          </select>
        </div>

        <div className="mt-5 grid gap-4">
          {filteredOrders.length === 0 ? <EmptyState label="Todavia no hay pedidos a proveedores con esos filtros." /> : null}
          {filteredOrders.map((order) => {
            const supplier = order.inventory_suppliers ?? supplierMap.get(order.supplier_id) ?? null;
            const canEdit = !order.is_deleted && order.status !== "recibido" && order.status !== "cancelado";
            const canPay = !order.is_deleted && order.status !== "cancelado" && Number(order.amount_pending ?? 0) > 0;

            return (
              <div key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.76)] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[rgba(110,74,47,0.1)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{order.status}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">{order.order_kind}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">Pago {order.payment_status}</span>
                    </div>
                    <h3 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">{supplier?.name ?? "Proveedor"}</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      Pedido {order.order_number ?? "sin numero"} · Factura {order.invoice_number ?? "sin factura"} · {order.city ?? "Sin ciudad"}
                      <br />
                      Solicitado {formatDate(order.requested_at)} · Recibido {order.received_at ? formatDate(order.received_at) : "pendiente"}
                      <br />
                      Total {formatMoney(order.subtotal_amount)} · Pagado {formatMoney(order.amount_paid)} · Pendiente {formatMoney(order.amount_pending)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(order.inventory_supplier_order_items ?? []).map((line) => (
                        <span key={line.id} className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">
                          {line.inventory_items?.name ?? "Item"} x {line.quantity_requested}
                        </span>
                      ))}
                    </div>
                    {order.notes ? <p className="mt-3 text-sm leading-6 text-[var(--color-copy)]">{order.notes}</p> : null}
                    <DeletedStatusNote row={order} />
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {canEdit ? (
                      <button onClick={() => openEditOrder(order)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    ) : null}
                    <button onClick={() => sendExistingOrderToWhatsApp(order)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </button>
                    {canEdit ? (
                      <button onClick={() => openEditOrder(order)} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                        <PackagePlus className="h-4 w-4" />
                        Recibir
                      </button>
                    ) : null}
                    {canPay ? (
                      <button onClick={() => openPaymentModal(order)} className="inline-flex items-center gap-2 rounded-full bg-[rgba(110,74,47,0.92)] px-4 py-2 text-sm font-semibold text-white">
                        <Receipt className="h-4 w-4" />
                        Registrar pago
                      </button>
                    ) : null}
                    {order.document_path ? (
                      <button onClick={() => void openPrivatePath(order.document_path)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        <Archive className="h-4 w-4" />
                        Ver pedido
                      </button>
                    ) : null}
                    <DeleteActions
                      role={role}
                      row={order}
                      compact
                      onSoftDelete={() => void softDeleteRecord({ table: "inventory_supplier_orders", id: order.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                      onRestore={() => void restoreRecord("inventory_supplier_orders", order.id).then(load)}
                    />
                  </div>
                </div>

                {order.inventory_supplier_order_payments?.length ? (
                  <div className="mt-4 grid gap-2">
                    {order.inventory_supplier_order_payments.map((payment) => (
                      <div key={payment.id} className="rounded-[18px] border border-[var(--color-border)] bg-white/75 p-3 text-sm text-[var(--color-copy)]">
                        {formatDate(payment.payment_date)} · {formatMoney(payment.amount)} · {payment.payment_method} · {payment.reference ?? "sin referencia"}
                        {payment.receipt_path ? (
                          <>
                            {" "}
                            ·{" "}
                            <button onClick={() => void openPrivatePath(payment.receipt_path)} className="font-semibold text-[var(--color-mocha)]">
                              ver comprobante
                            </button>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      {showOrderModal ? (
        <ModalShell title={editingOrder ? "Editar pedido a proveedor" : "Nuevo pedido a proveedor"} onClose={closeOrderModal}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Proveedor">
              <select value={orderForm.supplier_id} onChange={(event) => setOrderForm({ ...orderForm, supplier_id: event.target.value })} className="premium-input">
                <option value="">Selecciona proveedor</option>
                {suppliers.filter((supplier) => !supplier.is_deleted).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de pedido">
              <select value={orderForm.order_kind} onChange={(event) => setOrderForm({ ...orderForm, order_kind: event.target.value as SupplierOrderKind })} className="premium-input">
                <option value="compra">compra</option>
                <option value="credito">credito</option>
                <option value="consignacion">consignacion</option>
              </select>
            </Field>
            <Field label="Ubicacion de ingreso">
              <select value={orderForm.location_id} onChange={(event) => setOrderForm({ ...orderForm, location_id: event.target.value })} className="premium-input">
                <option value="">Sin ubicacion fija</option>
                {locations.filter((location) => !location.is_deleted).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ciudad">
              <select value={orderForm.city} onChange={(event) => setOrderForm({ ...orderForm, city: event.target.value })} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Numero de pedido">
              <input value={orderForm.order_number} onChange={(event) => setOrderForm({ ...orderForm, order_number: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Numero de factura">
              <input value={orderForm.invoice_number} onChange={(event) => setOrderForm({ ...orderForm, invoice_number: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Fecha de solicitud">
              <input type="date" value={orderForm.requested_at} onChange={(event) => setOrderForm({ ...orderForm, requested_at: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Vence o cobranza">
              <input type="date" value={orderForm.due_date} onChange={(event) => setOrderForm({ ...orderForm, due_date: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Notas" className="md:col-span-2">
              <textarea value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
          </div>

          <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.7)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Items del pedido</p>
                <p className="mt-2 text-sm text-[var(--color-copy)]">Puedes dejar cantidades recibidas en cero y completarlas cuando llegue el proveedor.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={addLine} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  <Plus className="h-4 w-4" />
                  Agregar linea
                </button>
                {editingOrder ? (
                  <button
                    onClick={() =>
                      setOrderForm((current) => ({
                        ...current,
                        lines: current.lines.map((line) => ({
                          ...line,
                          quantity_received: Number(line.quantity_requested),
                        })),
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                  >
                    <PackagePlus className="h-4 w-4" />
                    Completar recepcion
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {orderForm.lines.map((line) => {
                const item = itemMap.get(line.item_id);
                return (
                  <div key={line.local_id} className="rounded-[20px] border border-[var(--color-border)] bg-white/80 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="Item">
                        <select value={line.item_id} onChange={(event) => updateLine(line.local_id, { item_id: event.target.value })} className="premium-input">
                          <option value="">Selecciona item</option>
                          {items
                            .filter((itemRow) => !itemRow.is_deleted && (!orderForm.supplier_id || itemRow.supplier_id === orderForm.supplier_id || itemRow.id === line.item_id))
                            .map((itemRow) => (
                              <option key={itemRow.id} value={itemRow.id}>
                                {itemRow.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Cantidad pedida">
                        <input type="number" min={0} step="0.01" value={String(line.quantity_requested)} onChange={(event) => updateLine(line.local_id, { quantity_requested: Number(event.target.value) })} className="premium-input" />
                      </Field>
                      <Field label="Cantidad recibida">
                        <input type="number" min={0} step="0.01" value={String(line.quantity_received)} onChange={(event) => updateLine(line.local_id, { quantity_received: Number(event.target.value) })} className="premium-input" />
                      </Field>
                      <Field label="Costo unitario">
                        <input type="number" min={0} step="0.01" value={String(line.unit_cost)} onChange={(event) => updateLine(line.local_id, { unit_cost: Number(event.target.value) })} className="premium-input" />
                      </Field>
                      <Field label="Lote">
                        <input value={line.lot_number} onChange={(event) => updateLine(line.local_id, { lot_number: event.target.value })} className="premium-input" />
                      </Field>
                      <Field label="Vencimiento">
                        <input type="date" value={line.expiration_date} onChange={(event) => updateLine(line.local_id, { expiration_date: event.target.value })} className="premium-input" />
                      </Field>
                      <Field label="Notas" className="xl:col-span-2">
                        <input value={line.notes} onChange={(event) => updateLine(line.local_id, { notes: event.target.value })} className="premium-input" />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-[var(--color-copy)]">
                        {item ? `${item.name} · stock ${item.current_stock} · ${item.unit}` : "Selecciona un item"}
                      </p>
                      <button onClick={() => removeLine(line.local_id)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-[20px] bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Adjunto y total estimado</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">{formatMoney(orderEstimate)}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold sm:w-auto">
                <Archive className="h-4 w-4" />
                {documentFile ? "Cambiar adjunto" : editingOrder?.document_path ? "Reemplazar adjunto" : "Subir pedido o factura"}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
              </label>
              {editingOrder?.document_path ? (
                <button onClick={() => void openPrivatePath(editingOrder.document_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  Ver adjunto actual
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void submitOrder()} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Guardando..." : "Guardar pedido"}
            </button>
            <button onClick={() => void submitOrder({ sendWhatsapp: true })} disabled={saving} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Guardar y WhatsApp
            </button>
            {editingOrder ? (
              <button onClick={() => void submitOrder({ receiveNow: true })} disabled={saving} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                Guardar y recibir
              </button>
            ) : null}
            <button onClick={closeOrderModal} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}

      {paymentOrder ? (
        <ModalShell title="Registrar pago a proveedor" onClose={closePaymentModal}>
          <div className="rounded-[20px] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
            {paymentOrder.inventory_suppliers?.name ?? "Proveedor"} · pendiente {formatMoney(paymentOrder.amount_pending)}
            <br />
            Pedido {paymentOrder.order_number ?? "sin numero"} · Factura {paymentOrder.invoice_number ?? "sin factura"}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Monto">
              <input type="number" min={0.01} step="0.01" value={String(paymentForm.amount)} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} className="premium-input" />
            </Field>
            <Field label="Metodo">
              <select value={paymentForm.payment_method} onChange={(event) => setPaymentForm({ ...paymentForm, payment_method: event.target.value })} className="premium-input">
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.code}>
                    {method.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" value={paymentForm.payment_date} onChange={(event) => setPaymentForm({ ...paymentForm, payment_date: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Referencia">
              <input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Notas" className="md:col-span-2">
              <textarea value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold sm:w-auto">
              <Receipt className="h-4 w-4" />
              {paymentReceiptFile ? "Cambiar comprobante" : "Subir comprobante"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setPaymentReceiptFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void submitPayment()} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Guardando..." : "Registrar pago y mandar a caja"}
            </button>
            <button onClick={closePaymentModal} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/78 p-5">
      <p className="text-sm font-semibold text-[var(--color-copy)]">{label}</p>
      <p className="mt-4 font-display text-4xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-border)] bg-white/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--color-border)] bg-white/78 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function RowsEmpty<T>({
  rows,
  empty,
  render,
}: {
  rows: T[];
  empty: string;
  render: (row: T) => ReactNode;
}) {
  if (rows.length === 0) return <EmptyState label={empty} />;
  return <div className="grid gap-3">{rows.map(render)}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Proveedores</p>
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

function buildWhatsAppMessage(
  order: OrderFormState,
  supplier: Pick<InventorySupplierRow, "name" | "contact_name" | "phone" | "whatsapp_phone"> | null,
  itemMap: Map<string, InventoryItemRow>
) {
  const lines = order.lines
    .filter((line) => line.item_id)
    .map((line) => {
      const item = itemMap.get(line.item_id);
      return `- ${line.quantity_requested} ${item?.unit ?? "u"} de ${item?.name ?? "item"}${line.unit_cost > 0 ? ` @ ${formatMoney(line.unit_cost)}` : ""}`;
    })
    .join("\n");

  return [
    `Hola ${supplier?.contact_name || supplier?.name || ""}, queremos hacer un pedido.`,
    order.order_number ? `Pedido: ${order.order_number}` : null,
    order.invoice_number ? `Factura o referencia: ${order.invoice_number}` : null,
    order.order_kind !== "compra" ? `Modalidad: ${order.order_kind}` : null,
    order.city ? `Ciudad: ${order.city}` : null,
    "Items:",
    lines,
    `Total estimado: ${formatMoney(order.lines.reduce((sum, line) => sum + Number(line.quantity_requested || 0) * Number(line.unit_cost || 0), 0))}`,
    order.notes ? `Notas: ${order.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePhoneForWhatsApp(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("591")) return digits;
  if (digits.length === 8) return `591${digits}`;
  return digits;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
