import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type TreatmentOrderStatus = "Pendiente" | "En revision" | "Aprobado" | "Rechazado" | "Cancelado";

export type TreatmentOrderPreferredSlotInput = {
  rule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  city: string;
  location?: string | null;
  appointment_type: string;
  agenda_tag?: string | null;
};

export type TreatmentOrderRow = DeletionMetadata & {
  id: string;
  treatment_id: string;
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
  status: TreatmentOrderStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  treatments?: {
    id: string;
    title: string;
    slug: string;
    cover_image: string | null;
    city: string | null;
    doctor_id?: string | null;
    agenda_mode?: string | null;
    appointment_type?: string | null;
    agenda_tag?: string | null;
    treatment_price?: number | null;
    direct_booking_price?: number | null;
    direct_booking_label?: string | null;
    available_slots?: number | null;
    approved_slots?: number | null;
  } | null;
};

const orderSelect = [
  "*",
  "treatments(id, title, slug, cover_image, city, doctor_id, agenda_mode, appointment_type, agenda_tag, treatment_price, direct_booking_price, direct_booking_label, available_slots, approved_slots)",
].join(", ");

export function getTreatmentOrderPreferredSlot(row: TreatmentOrderRow) {
  if (!row.preferred_appointment_date || !row.preferred_start_time || !row.preferred_end_time) return null;

  return {
    rule_id: row.preferred_rule_id,
    date: row.preferred_appointment_date,
    start_time: row.preferred_start_time,
    end_time: row.preferred_end_time,
    city: row.preferred_city,
    location: row.preferred_location,
    appointment_type: row.preferred_appointment_type,
    agenda_tag: row.preferred_agenda_tag,
    appointment_reservation_id: row.appointment_reservation_id,
  };
}

export async function getTreatmentOrderById(orderId: string) {
  const { data, error } = await supabase.from("treatment_orders").select(orderSelect).eq("id", orderId).single();
  if (error) throw error;
  return data as unknown as TreatmentOrderRow;
}

export async function saveTreatmentOrder(data: {
  id?: string;
  treatment_id: string;
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
  preferred_slot?: TreatmentOrderPreferredSlotInput | null;
}) {
  const orderId = data.id ?? (!data.user_id ? crypto.randomUUID() : undefined);
  const payload = {
    treatment_id: data.treatment_id,
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
    preferred_rule_id: data.preferred_slot?.rule_id ?? null,
    preferred_appointment_date: data.preferred_slot?.date ?? null,
    preferred_start_time: data.preferred_slot?.start_time ?? null,
    preferred_end_time: data.preferred_slot?.end_time ?? null,
    preferred_city: data.preferred_slot?.city ?? null,
    preferred_location: data.preferred_slot?.location ?? null,
    preferred_appointment_type: data.preferred_slot?.appointment_type ?? null,
    preferred_agenda_tag: data.preferred_slot?.agenda_tag ?? null,
    status: "Pendiente",
  };

  if (!data.user_id) {
    const { error } = await supabase.from("treatment_orders").insert(payload);
    if (error) throw error;
    return { ...payload, id: orderId } as unknown as TreatmentOrderRow;
  }

  const { data: row, error } = await supabase.from("treatment_orders").insert(payload).select("*").single();
  if (error) throw error;
  return getTreatmentOrderById(row.id);
}

export async function getMyTreatmentOrders(userId: string) {
  const { data, error } = await supabase
    .from("treatment_orders")
    .select(orderSelect)
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TreatmentOrderRow[];
}

export async function getTreatmentOrdersAdmin(includeDeleted = false) {
  let query = supabase.from("treatment_orders").select(orderSelect).order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("treatment_orders", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TreatmentOrderRow[];
}

export async function uploadTreatmentOrderReceipt(file: File, orderId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `treatments/${orderId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachTreatmentOrderReceipt(orderId: string, payment_receipt_path: string) {
  const { error } = await supabase
    .from("treatment_orders")
    .update({
      payment_receipt_path,
      payment_submitted_at: new Date().toISOString(),
      status: "En revision",
    })
    .eq("id", orderId);
  if (error) throw error;
}

export async function getTreatmentOrderReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function approveTreatmentOrder(
  orderId: string,
  input: {
    adminNotes?: string | null;
    paymentAmount: number;
    paymentMethod: string;
  }
) {
  const { data, error } = await supabase.rpc("approve_treatment_order", {
    p_order_id: orderId,
    p_payment_amount: input.paymentAmount,
    p_payment_method: input.paymentMethod,
    p_admin_notes: input.adminNotes ?? null,
  });
  if (error) throw error;
  return data as TreatmentOrderRow;
}

export async function updateTreatmentOrderStatus(orderId: string, status: Exclude<TreatmentOrderStatus, "Aprobado">, adminNotes?: string | null) {
  const { data, error } = await supabase.rpc("set_treatment_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_admin_notes: adminNotes ?? null,
  });
  if (error) throw error;
  return data as TreatmentOrderRow;
}

export async function updateTreatmentOrderNotes(orderId: string, adminNotes: string) {
  const { error } = await supabase.from("treatment_orders").update({ admin_notes: adminNotes }).eq("id", orderId);
  if (error) throw error;
}
