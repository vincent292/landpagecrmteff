import { supabase } from "../lib/supabaseClient";

export type PrescriptionRow = {
  id: string;
  patient_id: string;
  created_by: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  title: string;
  prescription_text: string;
  indications: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export async function createPrescription(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("patient_prescriptions").insert(data).select("*, profiles:created_by(full_name, email, role)").single();
  if (error) throw error;
  return row as PrescriptionRow;
}

export async function getPrescriptionsByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("patient_prescriptions")
    .select("*, profiles:created_by(full_name, email, role)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrescriptionRow[];
}

export async function getMyPrescriptions(userId: string) {
  const { data, error } = await supabase
    .from("patient_prescriptions")
    .select("*, patients!inner(profile_id)")
    .eq("patients.profile_id", userId)
    .eq("is_visible_to_patient", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrescriptionRow[];
}

export async function updatePrescription(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("patient_prescriptions")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return row as PrescriptionRow;
}
