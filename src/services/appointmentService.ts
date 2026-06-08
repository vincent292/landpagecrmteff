import { supabase } from "../lib/supabaseClient";
import { shouldHidePatientPhone } from "../lib/patientPrivacy";
import type { UserRole } from "../types/platform";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

export type AppointmentRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  created_by: string | null;
  doctor_id?: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  doctor_profiles?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  city: string;
  location: string | null;
  status: string;
  payment_amount?: number | null;
  payment_method?: string | null;
  payment_status?: "Pendiente" | "Pagado" | "Devuelto";
  cash_movement_id?: string | null;
  cash_recorded_at?: string | null;
  notes: string | null;
  created_at: string;
};

export type AppointmentAdminRow = AppointmentRow & {
  patients?: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    document_number?: string | null;
  } | null;
};

type AppointmentBaseRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  created_by: string | null;
  doctor_id?: string | null;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  city: string;
  location: string | null;
  status: string;
  payment_amount?: number | null;
  payment_method?: string | null;
  payment_status?: "Pendiente" | "Pagado" | "Devuelto";
  cash_movement_id?: string | null;
  cash_recorded_at?: string | null;
  notes: string | null;
  created_at: string;
};

async function enrichAppointments(rows: AppointmentBaseRow[]) {
  if (rows.length === 0) return [] as AppointmentRow[];

  const createdByIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))] as string[];
  const doctorIds = [...new Set(rows.map((row) => row.doctor_id).filter(Boolean))] as string[];

  const [profilesResult, doctorsResult] = await Promise.all([
    createdByIds.length
      ? supabase.from("profiles").select("id, full_name, email, role").in("id", createdByIds)
      : Promise.resolve({ data: [], error: null }),
    doctorIds.length
      ? supabase.from("doctor_profiles").select("id, full_name, whatsapp, email").in("id", doctorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (doctorsResult.error) throw doctorsResult.error;

  const profileMap = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));
  const doctorMap = new Map((doctorsResult.data ?? []).map((row) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    profiles: row.created_by ? profileMap.get(row.created_by) ?? null : null,
    doctor_profiles: row.doctor_id ? doctorMap.get(row.doctor_id) ?? null : null,
  })) as AppointmentRow[];
}

export async function createAppointment(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("appointments").insert(data).select("*").single();
  if (error) throw error;
  return row as AppointmentRow;
}

export async function getAppointmentsByPatient(patientId: string, includeDeleted = false) {
  let query = supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .order("appointment_date", { ascending: true });
  const deletedFilter = getVisibleDeletionFilter("appointments", includeDeleted);
  if (deletedFilter.column) query = query.eq(deletedFilter.column, deletedFilter.value);
  const { data, error } = await query;
  if (error) throw error;
  return enrichAppointments((data ?? []) as AppointmentBaseRow[]);
}

function getAppointmentsAdminSelect(viewerRole?: UserRole) {
  const patientsSelect = shouldHidePatientPhone(viewerRole)
    ? "patients(full_name, email, city, document_number)"
    : "patients(full_name, phone, email, city, document_number)";
  return `*, ${patientsSelect}, doctor_profiles(id, full_name, whatsapp, email), profiles!appointments_created_by_fkey(full_name, email, role)`;
}

export async function getAppointmentsAdmin(
  includeDeleted = false,
  doctorId?: string | null,
  viewerRole?: UserRole
) {
  let query = supabase
    .from("appointments")
    .select(getAppointmentsAdminSelect(viewerRole))
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  const deletedFilter = getVisibleDeletionFilter("appointments", includeDeleted);
  if (deletedFilter.column) query = query.eq(deletedFilter.column, deletedFilter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AppointmentAdminRow[];
}

export async function getMyAppointments(userId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, patients!inner(profile_id)")
    .eq("patients.profile_id", userId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  return enrichAppointments((data ?? []) as AppointmentBaseRow[]);
}

export async function updateAppointment(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("appointments").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as AppointmentRow;
}

export async function updateAppointmentStatus(id: string, status: string) {
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) throw error;
}
