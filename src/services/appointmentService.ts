import { supabase } from "../lib/supabaseClient";

export type AppointmentRow = {
  id: string;
  patient_id: string;
  created_by: string | null;
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
  const { data: row, error } = await supabase.from("appointments").insert(data).select("*").single();
  if (error) throw error;
  return row as AppointmentRow;
}

export async function getAppointmentsByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .order("appointment_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentRow[];
}

export async function getMyAppointments(userId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, patients!inner(profile_id)")
    .eq("patients.profile_id", userId)
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
