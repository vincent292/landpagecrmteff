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

export async function createAppointment(data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("appointments")
    .insert(data)
    .select("*, profiles:created_by(full_name, email, role), doctor_profiles(id, full_name, whatsapp, email)")
    .single();
  if (error) throw error;
  return row as AppointmentRow;
}

export async function getAppointmentsByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, profiles:created_by(full_name, email, role), doctor_profiles(id, full_name, whatsapp, email)")
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentRow[];
}

export async function getMyAppointments(userId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, patients!inner(profile_id), doctor_profiles(id, full_name, whatsapp, email)")
    .eq("patients.profile_id", userId)
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentRow[];
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
