import { supabase } from "../lib/supabaseClient";
import { type DeletionMetadata } from "./adminDeletionService";

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
  notes: string | null;
  created_at: string;
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
  const { error } = await supabase.from("appointments").insert(data);
  if (error) throw error;
  return null;
}

export async function getAppointmentsByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  return enrichAppointments((data ?? []) as AppointmentBaseRow[]);
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
