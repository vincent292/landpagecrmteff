import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

export type PatientRow = DeletionMetadata & {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  birth_date: string | null;
  gender: string | null;
  emergency_contact: string | null;
  assigned_doctor_id?: string | null;
  notes: string | null;
  created_at: string;
};

export async function getPatients(includeDeleted = false) {
  let query = supabase.from("patients").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("patients", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PatientRow[];
}

export async function getPatientById(id: string) {
  const { data, error } = await supabase.from("patients").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as PatientRow | null;
}

export async function getPatientByProfileId(profileId: string) {
  const { data, error } = await supabase.from("patients").select("*").eq("profile_id", profileId).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as PatientRow | null;
}

export async function createPatient(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("patients").insert(data).select("*").single();
  if (error) throw error;
  return row as PatientRow;
}

export async function updatePatient(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("patients").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as PatientRow;
}
