import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type ReservationStatus = "Pendiente" | "Confirmada" | "Realizada" | "Cancelada" | "Rechazada";

export type AppointmentReservationRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  user_id: string;
  availability_rule_id: string | null;
  title: string | null;
  appointment_type: string;
  city: string;
  location: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: ReservationStatus;
  source: string;
  notes: string | null;
  created_by: string | null;
  doctor_id?: string | null;
  payment_receipt_path?: string | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
  payment_expires_at?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  patients?: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
  } | null;
  doctor_profiles?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
};

export type ReservationFilters = {
  city?: string;
  status?: string;
  appointment_type?: string;
  date?: string;
  query?: string;
};

async function expireUnpaidReservations() {
  const { error } = await supabase.rpc("expire_unpaid_appointment_reservations");
  if (error) throw error;
}

export async function getReservationsAdmin(filters: ReservationFilters = {}, includeDeleted = false) {
  await expireUnpaidReservations();
  let query = supabase
    .from("appointment_reservations")
    .select("*, patients(full_name, phone, email, city), doctor_profiles(id, full_name, whatsapp, email)")
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  const deletedFilter = getVisibleDeletionFilter("appointment_reservations", includeDeleted);
  if (deletedFilter.column) query = query.eq(deletedFilter.column, deletedFilter.value);

  if (filters.city && filters.city !== "Todas") query = query.eq("city", filters.city);
  if (filters.status && filters.status !== "Todos") query = query.eq("status", filters.status);
  if (filters.appointment_type && filters.appointment_type !== "Todos") {
    query = query.eq("appointment_type", filters.appointment_type);
  }
  if (filters.date) query = query.eq("appointment_date", filters.date);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as AppointmentReservationRow[];
  const search = filters.query?.trim().toLowerCase();
  if (!search) return rows;

  return rows.filter((row) =>
    JSON.stringify({
      patient: row.patients,
      type: row.appointment_type,
      city: row.city,
      status: row.status,
    })
      .toLowerCase()
      .includes(search)
  );
}

export async function getReservationById(id: string) {
  await expireUnpaidReservations();
  const { data, error } = await supabase
    .from("appointment_reservations")
    .select("*, patients(full_name, phone, email, city), doctor_profiles(id, full_name, whatsapp, email)")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  return data as AppointmentReservationRow | null;
}

export async function getMyReservations(userId: string) {
  await expireUnpaidReservations();
  const { data, error } = await supabase
    .from("appointment_reservations")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentReservationRow[];
}

export async function getReservationsByPatientId(patientId: string) {
  await expireUnpaidReservations();
  const { data, error } = await supabase
    .from("appointment_reservations")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentReservationRow[];
}

export async function createReservation(data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("appointment_reservations")
    .insert(data)
    .select("*")
    .single();
  if (error) throw error;
  return row as AppointmentReservationRow;
}

export async function bookAppointmentSlot(data: {
  user_id: string;
  patient_id: string;
  rule_id: string;
  date: string;
  start_time: string;
  end_time: string;
  city: string;
  appointment_type: string;
  notes?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("book_appointment_slot", {
    p_user_id: data.user_id,
    p_patient_id: data.patient_id,
    p_rule_id: data.rule_id,
    p_date: data.date,
    p_start_time: data.start_time,
    p_end_time: data.end_time,
    p_city: data.city,
    p_appointment_type: data.appointment_type,
    p_notes: data.notes ?? null,
  });

  if (error) throw error;
  return row as AppointmentReservationRow;
}

export async function updateReservationStatus(id: string, status: ReservationStatus) {
  const { error } = await supabase.from("appointment_reservations").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updateReservation(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("appointment_reservations")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return row as AppointmentReservationRow;
}

export async function cancelReservation(id: string) {
  return updateReservationStatus(id, "Cancelada");
}

export async function uploadReservationPaymentReceipt(file: File, reservationId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `appointments/${reservationId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachReservationPaymentReceipt(reservationId: string, payment_receipt_path: string) {
  const { error } = await supabase
    .from("appointment_reservations")
    .update({ payment_receipt_path, payment_submitted_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw error;
}

export async function getReservationReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function approveReservationPayment(reservationId: string, adminNotes: string) {
  const { data, error } = await supabase
    .from("appointment_reservations")
    .update({
      status: "Confirmada",
      admin_notes: adminNotes,
      payment_verified_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .select("*")
    .single();
  if (error) throw error;
  return data as AppointmentReservationRow;
}

export async function rejectReservationPayment(reservationId: string, adminNotes: string) {
  const { data, error } = await supabase
    .from("appointment_reservations")
    .update({
      status: "Rechazada",
      admin_notes: adminNotes,
    })
    .eq("id", reservationId)
    .select("*")
    .single();
  if (error) throw error;
  return data as AppointmentReservationRow;
}
