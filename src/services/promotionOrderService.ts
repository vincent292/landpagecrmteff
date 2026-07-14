import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type PromotionOrderStatus = "Pendiente" | "En revision" | "Aprobado" | "Rechazado" | "Cancelado";

export type PromotionOrderItemRow = {
  id: string;
  order_id: string;
  variant_id: string;
  title_snapshot: string;
  unit_price: number;
  quantity: number;
  preferred_rule_id: string | null;
  preferred_appointment_date: string | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  preferred_city: string | null;
  preferred_location: string | null;
  preferred_appointment_type: string | null;
  preferred_agenda_tag: string | null;
  appointment_reservation_id: string | null;
  created_at: string;
  promotion_variants?: {
    id: string;
    title: string;
    price_total: number;
    available_slots: number;
    approved_slots: number;
  } | null;
};

export type PromotionOrderPreferredSlotInput = {
  rule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  city: string;
  location?: string | null;
  appointment_type: string;
  agenda_tag?: string | null;
};

export type PromotionOrderCartItemInput = {
  variant_id: string;
  title: string;
  unit_price: number;
  quantity?: number;
  preferred_slot?: PromotionOrderPreferredSlotInput | null;
};

export type PromotionOrderRow = DeletionMetadata & {
  id: string;
  promotion_id: string;
  variant_id: string;
  user_id: string | null;
  full_name: string;
  document_number: string | null;
  phone: string | null;
  email: string;
  city: string | null;
  notes: string | null;
  wants_appointment: boolean;
  payment_mode: "total" | "anticipo";
  payment_percent: number;
  total_amount: number;
  amount_paid: number | null;
  amount_pending: number | null;
  payment_method: string | null;
  payment_receipt_path: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  cash_movement_id: string | null;
  cash_recorded_at: string | null;
  preferred_rule_id: string | null;
  preferred_appointment_date: string | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  preferred_city: string | null;
  preferred_location: string | null;
  preferred_appointment_type: string | null;
  preferred_agenda_tag: string | null;
  appointment_reservation_id: string | null;
  status: PromotionOrderStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  promotions?: {
    title: string;
    slug: string;
    cover_image: string | null;
    city: string | null;
    doctor_id?: string | null;
    agenda_mode?: string | null;
    appointment_type?: string | null;
    agenda_tag?: string | null;
  } | null;
  promotion_variants?: {
    id: string;
    title: string;
    price_total: number;
    available_slots: number;
    approved_slots: number;
  } | null;
  promotion_order_items?: PromotionOrderItemRow[] | null;
};

const orderSelect = [
  "*",
  "promotions(title, slug, cover_image, city, doctor_id, agenda_mode, appointment_type, agenda_tag)",
  "promotion_variants(id, title, price_total, available_slots, approved_slots)",
  "promotion_order_items(*, promotion_variants(id, title, price_total, available_slots, approved_slots))",
].join(", ");

export function getPromotionOrderItems(row: PromotionOrderRow) {
  if (row.promotion_order_items?.length) return row.promotion_order_items;
  if (!row.promotion_variants) return [] as PromotionOrderItemRow[];

  return [
    {
      id: row.id,
      order_id: row.id,
      variant_id: row.promotion_variants.id,
      title_snapshot: row.promotion_variants.title,
      unit_price: row.promotion_variants.price_total,
      quantity: 1,
      preferred_rule_id: row.preferred_rule_id,
      preferred_appointment_date: row.preferred_appointment_date,
      preferred_start_time: row.preferred_start_time,
      preferred_end_time: row.preferred_end_time,
      preferred_city: row.preferred_city,
      preferred_location: row.preferred_location,
      preferred_appointment_type: row.preferred_appointment_type,
      preferred_agenda_tag: row.preferred_agenda_tag,
      appointment_reservation_id: row.appointment_reservation_id,
      created_at: row.created_at,
      promotion_variants: row.promotion_variants,
    },
  ];
}

export function getPromotionOrderItemPreferredSlot(item: PromotionOrderItemRow, row?: PromotionOrderRow) {
  const fallback = row
    ? {
        preferred_rule_id: row.preferred_rule_id,
        preferred_appointment_date: row.preferred_appointment_date,
        preferred_start_time: row.preferred_start_time,
        preferred_end_time: row.preferred_end_time,
        preferred_city: row.preferred_city,
        preferred_location: row.preferred_location,
        preferred_appointment_type: row.preferred_appointment_type,
        preferred_agenda_tag: row.preferred_agenda_tag,
        appointment_reservation_id: row.appointment_reservation_id,
      }
    : null;

  const source = item.preferred_rule_id || item.preferred_appointment_date ? item : fallback;
  if (!source?.preferred_appointment_date || !source.preferred_start_time || !source.preferred_end_time) return null;

  return {
    rule_id: source.preferred_rule_id,
    date: source.preferred_appointment_date,
    start_time: source.preferred_start_time,
    end_time: source.preferred_end_time,
    city: source.preferred_city,
    location: source.preferred_location,
    appointment_type: source.preferred_appointment_type,
    agenda_tag: source.preferred_agenda_tag,
    appointment_reservation_id: source.appointment_reservation_id,
  };
}

async function replacePromotionOrderItems(orderId: string, items: PromotionOrderCartItemInput[], replaceExisting = true) {
  if (replaceExisting) {
    const { error: deleteError } = await supabase.from("promotion_order_items").delete().eq("order_id", orderId);
    if (deleteError) throw deleteError;
  }

  if (items.length === 0) return;

  const { error } = await supabase.from("promotion_order_items").insert(
    items.map((item) => ({
      order_id: orderId,
      variant_id: item.variant_id,
      title_snapshot: item.title,
      unit_price: item.unit_price,
      quantity: item.quantity ?? 1,
      preferred_rule_id: item.preferred_slot?.rule_id ?? null,
      preferred_appointment_date: item.preferred_slot?.date ?? null,
      preferred_start_time: item.preferred_slot?.start_time ?? null,
      preferred_end_time: item.preferred_slot?.end_time ?? null,
      preferred_city: item.preferred_slot?.city ?? null,
      preferred_location: item.preferred_slot?.location ?? null,
      preferred_appointment_type: item.preferred_slot?.appointment_type ?? null,
      preferred_agenda_tag: item.preferred_slot?.agenda_tag ?? null,
    }))
  );
  if (error) throw error;
}

export async function getPromotionOrderById(orderId: string) {
  const { data, error } = await supabase.from("promotion_orders").select(orderSelect).eq("id", orderId).single();
  if (error) throw error;
  return data as unknown as PromotionOrderRow;
}

export async function savePromotionOrder(data: {
  id?: string;
  promotion_id: string;
  user_id?: string | null;
  full_name: string;
  document_number: string | null;
  phone: string | null;
  email: string;
  city: string | null;
  notes: string | null;
  wants_appointment: boolean;
  payment_mode: "total" | "anticipo";
  payment_percent: number;
  total_amount: number;
  items: PromotionOrderCartItemInput[];
}) {
  if (data.items.length === 0) throw new Error("Selecciona al menos una opcion de la promocion.");
  const primaryVariantId = data.items[0].variant_id;
  const primaryPreferredSlot = data.items.find((item) => item.preferred_slot)?.preferred_slot ?? null;
  const orderId = data.id ?? (!data.user_id ? crypto.randomUUID() : undefined);

  const basePayload = {
    promotion_id: data.promotion_id,
    variant_id: primaryVariantId,
    ...(orderId ? { id: orderId } : {}),
    user_id: data.user_id ?? null,
    full_name: data.full_name,
    document_number: data.document_number,
    phone: data.phone,
    email: data.email,
    city: data.city,
    notes: data.notes,
    wants_appointment: data.wants_appointment,
    payment_mode: data.payment_mode,
    payment_percent: data.payment_percent,
    total_amount: data.total_amount,
    amount_paid: null,
    amount_pending: data.total_amount,
    preferred_rule_id: primaryPreferredSlot?.rule_id ?? null,
    preferred_appointment_date: primaryPreferredSlot?.date ?? null,
    preferred_start_time: primaryPreferredSlot?.start_time ?? null,
    preferred_end_time: primaryPreferredSlot?.end_time ?? null,
    preferred_city: primaryPreferredSlot?.city ?? null,
    preferred_location: primaryPreferredSlot?.location ?? null,
    preferred_appointment_type: primaryPreferredSlot?.appointment_type ?? null,
    preferred_agenda_tag: primaryPreferredSlot?.agenda_tag ?? null,
  };

  const payload = {
    ...basePayload,
    status: "Pendiente",
  };

  if (!data.user_id) {
    const { error } = await supabase.from("promotion_orders").insert(payload);
    if (error) throw error;
    await replacePromotionOrderItems(orderId!, data.items, false);
    return { ...payload, id: orderId } as unknown as PromotionOrderRow;
  }

  const { data: row, error } = await supabase.from("promotion_orders").insert(payload).select("*").single();
  if (error) throw error;
  await replacePromotionOrderItems(row.id, data.items, false);
  return getPromotionOrderById(row.id);
}

export async function getMyPromotionOrders(userId: string) {
  const { data, error } = await supabase
    .from("promotion_orders")
    .select(orderSelect)
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PromotionOrderRow[];
}

export async function getPromotionOrdersAdmin(includeDeleted = false) {
  let query = supabase.from("promotion_orders").select(orderSelect).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("promotion_orders", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PromotionOrderRow[];
}

export async function uploadPromotionOrderReceipt(file: File, orderId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `promotions/${orderId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachPromotionOrderReceipt(orderId: string, payment_receipt_path: string) {
  const { error } = await supabase
    .from("promotion_orders")
    .update({
      payment_receipt_path,
      payment_submitted_at: new Date().toISOString(),
      status: "En revision",
    })
    .eq("id", orderId);
  if (error) throw error;
}

export async function getPromotionOrderReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function approvePromotionOrder(
  orderId: string,
  input: {
    adminNotes?: string | null;
    paymentAmount: number;
    paymentMethod: string;
  }
) {
  const { data, error } = await supabase.rpc("approve_promotion_order", {
    p_order_id: orderId,
    p_payment_amount: input.paymentAmount,
    p_payment_method: input.paymentMethod,
    p_admin_notes: input.adminNotes ?? null,
  });
  if (error) throw error;
  return data as PromotionOrderRow;
}

export async function updatePromotionOrderStatus(orderId: string, status: Exclude<PromotionOrderStatus, "Aprobado">, adminNotes?: string | null) {
  const { data, error } = await supabase.rpc("set_promotion_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_admin_notes: adminNotes ?? null,
  });
  if (error) throw error;
  return data as PromotionOrderRow;
}

export async function updatePromotionOrderNotes(orderId: string, adminNotes: string) {
  const { error } = await supabase.from("promotion_orders").update({ admin_notes: adminNotes }).eq("id", orderId);
  if (error) throw error;
}
