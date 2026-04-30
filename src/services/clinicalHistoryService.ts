import { supabase } from "../lib/supabaseClient";

export type ClinicalHistoryRow = {
  id: string;
  patient_id: string;
  created_by: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  session_title: string | null;
  session_date: string | null;
  reason_for_consultation: string | null;
  medical_history: string | null;
  allergies: string | null;
  current_medications: string | null;
  previous_procedures: string | null;
  diagnosis: string | null;
  observations: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicalEvolutionRow = {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  created_by: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  title: string;
  description: string;
  treatment_performed: string | null;
  recommendations: string | null;
  created_at: string;
};

export async function getClinicalHistoryByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_histories")
    .select("*, profiles:created_by(full_name, email, role)")
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ClinicalHistoryRow | null;
}

export async function getClinicalHistoriesByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_histories")
    .select("*, profiles:created_by(full_name, email, role)")
    .eq("patient_id", patientId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalHistoryRow[];
}

export async function createClinicalHistory(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("clinical_histories").insert(data).select("*, profiles:created_by(full_name, email, role)").single();
  if (error) throw error;
  return row as ClinicalHistoryRow;
}

export async function updateClinicalHistory(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("clinical_histories")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, profiles:created_by(full_name, email, role)")
    .single();
  if (error) throw error;
  return row as ClinicalHistoryRow;
}

export async function createClinicalEvolution(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("clinical_evolutions").insert(data).select("*, profiles:created_by(full_name, email, role)").single();
  if (error) throw error;
  return row as ClinicalEvolutionRow;
}

export async function getClinicalEvolutions(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_evolutions")
    .select("*, profiles:created_by(full_name, email, role)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalEvolutionRow[];
}
