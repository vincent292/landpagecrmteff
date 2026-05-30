import { supabase } from "../lib/supabaseClient";
import { getCareModeLabel, type AvailabilityCareMode, type ReservationCareMode } from "../lib/careMode";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { getSignedUrl, uploadPrivateFile } from "./storageService";

const receiptsBucket = "payment-receipts-private";

export type ReservationStatus = "Pendiente" | "Confirmada" | "Realizada" | "Cancelada" | "Rechazada";

export type AppointmentReservationRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  user_id: string | null;
  availability_rule_id: string | null;
  title: string | null;
  appointment_type: string;
  care_mode: AvailabilityCareMode;
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
  public_payment_token?: string | null;
  public_payment_token_expires_at?: string | null;
  payment_link_sent_at?: string | null;
  payment_amount?: number | null;
  payment_method?: string | null;
  cash_movement_id?: string | null;
  cash_recorded_at?: string | null;
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

export type ManualReservationPaymentPageRow = {
  reservation_id: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_city: string | null;
  patient_document_number: string | null;
  appointment_title: string | null;
  appointment_type: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  doctor_name: string | null;
  payment_amount: number | null;
  payment_expires_at: string | null;
  payment_receipt_path: string | null;
  status: ReservationStatus;
};

export type ReservationFilters = {
  city?: string;
  status?: string;
  appointment_type?: string;
  date?: string;
  query?: string;
  doctor_id?: string | null;
};

export type PublicAssessmentReservationInput = {
  full_name: string;
  phone: string;
  email?: string | null;
  city: string;
  document_number: string;
  appointment_type: string;
  care_mode: ReservationCareMode;
  assessment_label?: string | null;
  payment_receipt_path: string;
  payment_amount: number;
  slot: {
    rule_id: string;
    doctor_id?: string | null;
    date: string;
    start_time: string;
    end_time: string;
    city: string;
  };
  source?: string | null;
  notes?: string | null;
  context_type?: "promotion" | "treatment" | "general" | null;
  context_title?: string | null;
  context_reference_id?: string | null;
};

export type ManualAppointmentReservationInput = {
  patient_id: string;
  user_id?: string | null;
  doctor_id?: string | null;
  slot: {
    rule_id: string;
    doctor_id?: string | null;
    date: string;
    start_time: string;
    end_time: string;
    city: string;
    location?: string | null;
    appointment_type: string;
    care_mode?: AvailabilityCareMode | null;
  };
  title?: string | null;
  notes?: string | null;
  payment_amount: number;
  payment_method?: string | null;
  payment_receipt_path?: string | null;
  payment_window_hours?: number | null;
  created_by?: string | null;
  confirm_immediately?: boolean;
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
  if (filters.doctor_id) query = query.eq("doctor_id", filters.doctor_id);
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
    .select("*, patients!inner(profile_id), doctor_profiles(id, full_name, whatsapp, email)")
    .eq("patients.profile_id", userId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentReservationRow[];
}

export async function getReservationsByPatientId(patientId: string, includeDeleted = false) {
  await expireUnpaidReservations();
  let query = supabase
    .from("appointment_reservations")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .eq("patient_id", patientId)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });
  const deletedFilter = getVisibleDeletionFilter("appointment_reservations", includeDeleted);
  if (deletedFilter.column) query = query.eq(deletedFilter.column, deletedFilter.value);
  const { data, error } = await query;
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

export async function createManualAppointmentReservation(input: ManualAppointmentReservationInput) {
  const paymentWindowHours = Math.max(1, Math.min(72, Math.round(input.payment_window_hours ?? 24)));
  const tokenExpiresAt = new Date(Date.now() + paymentWindowHours * 60 * 60 * 1000).toISOString();
  const publicPaymentToken = crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();

  const payload = {
    patient_id: input.patient_id,
    user_id: input.user_id ?? null,
    doctor_id: input.doctor_id ?? input.slot.doctor_id ?? null,
    availability_rule_id: input.slot.rule_id,
    title: input.title ?? input.slot.appointment_type,
    appointment_type: input.slot.appointment_type,
    care_mode: input.slot.care_mode ?? "presencial",
    city: input.slot.city,
    location: input.slot.location ?? null,
    appointment_date: input.slot.date,
    start_time: input.slot.start_time,
    end_time: input.slot.end_time,
    status: input.confirm_immediately ? "Confirmada" : "Pendiente",
    source: "admin_manual",
    notes: input.notes ?? null,
    created_by: input.created_by ?? null,
    payment_amount: input.payment_amount,
    payment_method: input.payment_method ?? null,
    payment_receipt_path: input.payment_receipt_path ?? null,
    payment_submitted_at: input.payment_receipt_path ? new Date().toISOString() : null,
    payment_verified_at: input.confirm_immediately ? new Date().toISOString() : null,
    payment_expires_at: tokenExpiresAt,
    public_payment_token: input.confirm_immediately ? null : publicPaymentToken,
    public_payment_token_expires_at: input.confirm_immediately ? null : tokenExpiresAt,
    payment_link_sent_at: input.confirm_immediately ? null : new Date().toISOString(),
  };

  const { data: row, error } = await supabase.from("appointment_reservations").insert(payload).select("*").single();
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
  care_mode?: AvailabilityCareMode | null;
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
    p_care_mode: data.care_mode ?? null,
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

export async function uploadPublicAssessmentReceipt(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `appointments/public-assessment/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function uploadManualReservationReceipt(file: File, token?: string | null) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const tokenSegment = (token ?? crypto.randomUUID()).replace(/[^0-9A-Za-z_-]/g, "").slice(0, 24);
  const path = `appointments/manual-payment/${tokenSegment}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachReservationPaymentReceipt(reservationId: string, payment_receipt_path: string) {
  const { data, error } = await supabase.rpc("submit_patient_reservation_receipt", {
    p_reservation_id: reservationId,
    p_payment_receipt_path: payment_receipt_path,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "404") {
      throw new Error("Falta aplicar la migracion del portal del paciente en Supabase. Ejecuta npx supabase db push y vuelve a intentar.");
    }
    throw error;
  }
  return data as AppointmentReservationRow;
}

export async function getReservationReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function createPublicAssessmentReservation(input: PublicAssessmentReservationInput) {
  const baseArgs = {
    p_content_type: input.context_type ?? "general",
    p_content_id: input.context_reference_id ?? null,
    p_content_title: input.context_title ?? null,
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_city: input.city,
    p_document_number: input.document_number,
    p_notes: input.notes ?? null,
    p_rule_id: input.slot.rule_id,
    p_date: input.slot.date,
    p_start_time: input.slot.start_time,
    p_end_time: input.slot.end_time,
    p_payment_receipt_path: input.payment_receipt_path,
    p_payment_amount: input.payment_amount,
    p_assessment_label: input.assessment_label ?? null,
    p_appointment_type: input.appointment_type,
  };

  const { data, error } = await supabase.rpc("create_public_assessment_reservation", {
    ...baseArgs,
    p_care_mode: input.care_mode,
  });

  if (error) {
    if (!canRetryLegacyPublicAssessmentReservation(error)) throw error;

    const fallbackNotes = [input.notes?.trim(), `Modalidad: ${getCareModeLabel(input.care_mode)}`]
      .filter(Boolean)
      .join("\n");

    const legacyResponse = await supabase.rpc("create_public_assessment_reservation", {
      ...baseArgs,
      p_notes: fallbackNotes || null,
    });

    if (legacyResponse.error) throw legacyResponse.error;
    return legacyResponse.data as AppointmentReservationRow;
  }

  return data as AppointmentReservationRow;
}

function canRetryLegacyPublicAssessmentReservation(error: { code?: string; message?: string | null }) {
  if (error.code === "PGRST202") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("create_public_assessment_reservation") && message.includes("could not find");
}

export async function getManualReservationPaymentByToken(token: string) {
  const { data, error } = await supabase.rpc("get_manual_reservation_payment_by_token", {
    p_token: token,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ManualReservationPaymentPageRow | null;
}

export async function submitManualReservationPaymentByToken(token: string, payment_receipt_path: string) {
  const { data, error } = await supabase.rpc("submit_manual_reservation_payment_by_token", {
    p_token: token,
    p_payment_receipt_path: payment_receipt_path,
  });
  if (error) throw error;
  return data as AppointmentReservationRow;
}

export async function regenerateManualReservationPaymentLink(
  reservationId: string,
  paymentWindowHours = 24
) {
  const nextToken = crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(72, Math.round(paymentWindowHours))) * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("appointment_reservations")
    .update({
      status: "Pendiente",
      public_payment_token: nextToken,
      public_payment_token_expires_at: expiresAt,
      payment_link_sent_at: new Date().toISOString(),
      payment_receipt_path: null,
      payment_submitted_at: null,
      payment_verified_at: null,
      payment_method: null,
    })
    .eq("id", reservationId)
    .eq("source", "admin_manual")
    .select("*")
    .single();

  if (error) throw error;
  return data as AppointmentReservationRow;
}

export async function approveReservationPayment(
  reservationId: string,
  input: {
    adminNotes?: string | null;
    paymentAmount: number;
    paymentMethod: string;
  }
) {
  const { data, error } = await supabase
    .from("appointment_reservations")
    .update({
      status: "Confirmada",
      admin_notes: input.adminNotes ?? null,
      payment_amount: input.paymentAmount,
      payment_method: input.paymentMethod,
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
