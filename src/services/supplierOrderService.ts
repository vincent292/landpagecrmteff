import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type SupplierOrderStatus = "borrador" | "pedido" | "recibido" | "cancelado";
export type SupplierOrderKind = "compra" | "credito" | "consignacion";
export type SupplierOrderPaymentStatus = "pendiente" | "parcial" | "pagado";
export type SupplierOrderItemStatus = "pendiente" | "recibido" | "cancelado";

export type SupplierOrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
  quantity_requested: number;
  quantity_received: number;
  unit_cost: number;
  line_total: number;
  lot_number: string | null;
  expiration_date: string | null;
  notes: string | null;
  status: SupplierOrderItemStatus;
  created_at: string;
  updated_at: string;
  inventory_items?: {
    id: string;
    name: string;
    unit: string;
    current_stock: number;
  } | null;
};

export type SupplierOrderPaymentRow = {
  id: string;
  order_id: string;
  cash_movement_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  receipt_path: string | null;
  status: "registrado" | "anulado";
  created_at: string;
  updated_at: string;
};

export type SupplierOrderRow = DeletionMetadata & {
  id: string;
  supplier_id: string;
  location_id: string | null;
  status: SupplierOrderStatus;
  order_kind: SupplierOrderKind;
  payment_status: SupplierOrderPaymentStatus;
  city: string | null;
  order_number: string | null;
  invoice_number: string | null;
  requested_at: string;
  received_at: string | null;
  due_date: string | null;
  notes: string | null;
  whatsapp_message: string | null;
  sent_to_supplier_at: string | null;
  document_path: string | null;
  subtotal_amount: number;
  amount_paid: number;
  amount_pending: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
  inventory_suppliers?: {
    id: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    email: string | null;
    payment_terms_days: number;
    allows_consignment: boolean;
  } | null;
  inventory_locations?: {
    id: string;
    name: string;
  } | null;
  inventory_supplier_order_items?: SupplierOrderItemRow[] | null;
  inventory_supplier_order_payments?: SupplierOrderPaymentRow[] | null;
};

export type SupplierOrderItemInput = {
  item_id: string;
  quantity_requested: number;
  quantity_received?: number;
  unit_cost: number;
  lot_number?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
  status?: SupplierOrderItemStatus;
};

const orderSelect = [
  "*",
  "inventory_suppliers(id, name, contact_name, phone, whatsapp_phone, email, payment_terms_days, allows_consignment)",
  "inventory_locations(id, name)",
  "inventory_supplier_order_items(*, inventory_items(id, name, unit, current_stock))",
  "inventory_supplier_order_payments(*)",
].join(", ");

export async function getInventorySupplierOrders(includeDeleted = false) {
  let query = supabase.from("inventory_supplier_orders").select(orderSelect).order("requested_at", { ascending: false }).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("inventory_supplier_orders", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SupplierOrderRow[];
}

async function replaceOrderItems(orderId: string, items: SupplierOrderItemInput[]) {
  const { error: deleteError } = await supabase.from("inventory_supplier_order_items").delete().eq("order_id", orderId);
  if (deleteError) throw deleteError;

  if (items.length === 0) return;

  const payload = items.map((item) => ({
    order_id: orderId,
    item_id: item.item_id,
    quantity_requested: Number(item.quantity_requested),
    quantity_received: Number(item.quantity_received ?? 0),
    unit_cost: Number(item.unit_cost),
    lot_number: normalizeText(item.lot_number),
    expiration_date: normalizeText(item.expiration_date),
    notes: normalizeText(item.notes),
    status: item.status ?? "pendiente",
  }));

  const { error } = await supabase.from("inventory_supplier_order_items").insert(payload);
  if (error) throw error;
}

export async function saveInventorySupplierOrder(input: {
  orderId?: string | null;
  supplier_id: string;
  location_id?: string | null;
  status: SupplierOrderStatus;
  order_kind: SupplierOrderKind;
  city?: string | null;
  order_number?: string | null;
  invoice_number?: string | null;
  requested_at?: string | null;
  due_date?: string | null;
  notes?: string | null;
  whatsapp_message?: string | null;
  sent_to_supplier_at?: string | null;
  document_path?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  items: SupplierOrderItemInput[];
}) {
  if (input.items.length === 0) throw new Error("Agrega al menos un item al pedido.");

  const basePayload = {
    supplier_id: input.supplier_id,
    location_id: normalizeText(input.location_id),
    status: input.status,
    order_kind: input.order_kind,
    city: normalizeText(input.city),
    order_number: normalizeText(input.order_number),
    invoice_number: normalizeText(input.invoice_number),
    requested_at: input.requested_at ? new Date(input.requested_at).toISOString() : new Date().toISOString(),
    due_date: normalizeText(input.due_date),
    notes: normalizeText(input.notes),
    whatsapp_message: normalizeText(input.whatsapp_message),
    sent_to_supplier_at: input.sent_to_supplier_at ? new Date(input.sent_to_supplier_at).toISOString() : null,
    document_path: normalizeText(input.document_path),
    updated_by: input.updated_by ?? null,
  };

  if (input.orderId) {
    const { error } = await supabase.from("inventory_supplier_orders").update(basePayload).eq("id", input.orderId);
    if (error) throw error;
    await replaceOrderItems(input.orderId, input.items);
    const { data, error: loadError } = await supabase.from("inventory_supplier_orders").select(orderSelect).eq("id", input.orderId).single();
    if (loadError) throw loadError;
    return data as unknown as SupplierOrderRow;
  }

  const { data, error } = await supabase
    .from("inventory_supplier_orders")
    .insert({
      ...basePayload,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  await replaceOrderItems(data.id, input.items);
  const { data: fullRow, error: loadError } = await supabase.from("inventory_supplier_orders").select(orderSelect).eq("id", data.id).single();
  if (loadError) throw loadError;
  return fullRow as unknown as SupplierOrderRow;
}

export async function receiveInventorySupplierOrder(orderId: string) {
  const { data, error } = await supabase.rpc("receive_inventory_supplier_order", {
    p_order_id: orderId,
    p_received_at: new Date().toISOString(),
  });
  if (error) throw error;
  return data as SupplierOrderRow;
}

export async function registerInventorySupplierOrderPayment(input: {
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  receiptPath?: string | null;
  drawerId?: string | null;
  registerSessionId?: string | null;
  city?: string | null;
}) {
  const { data, error } = await supabase.rpc("register_inventory_supplier_order_payment", {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_date: input.paymentDate,
    p_reference: normalizeText(input.reference),
    p_notes: normalizeText(input.notes),
    p_receipt_path: normalizeText(input.receiptPath),
    p_drawer_id: normalizeText(input.drawerId),
    p_register_session_id: normalizeText(input.registerSessionId),
    p_city: normalizeText(input.city),
  });
  if (error) throw error;
  return data as SupplierOrderPaymentRow;
}

export async function uploadSupplierOrderDocument(file: File, scopeId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `supplier-orders/${scopeId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function getSupplierOrderDocumentUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function updateSupplierOrderDocument(orderId: string, document_path: string | null) {
  const { error } = await supabase.from("inventory_supplier_orders").update({ document_path }).eq("id", orderId);
  if (error) throw error;
}

function normalizeText(value?: string | null) {
  const next = String(value ?? "").trim();
  return next.length > 0 ? next : null;
}
