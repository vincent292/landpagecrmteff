import { supabase } from "../lib/supabaseClient";

export type PostCareRow = {
  id: string;
  patient_id: string;
  created_by: string | null;
  title: string;
  treatment_name: string | null;
  care_instructions: string;
  warning_signs: string | null;
  next_steps: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export async function createPostTreatmentCare(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("post_treatment_cares").insert(data).select("*").single();
  if (error) throw error;
  return row as PostCareRow;
}

export async function getPostCaresByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("post_treatment_cares")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PostCareRow[];
}

export async function getMyPostCares(userId: string) {
  const { data, error } = await supabase
    .from("post_treatment_cares")
    .select("*, patients!inner(profile_id)")
    .eq("patients.profile_id", userId)
    .eq("is_visible_to_patient", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PostCareRow[];
}

export async function updatePostCare(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("post_treatment_cares")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return row as PostCareRow;
}
