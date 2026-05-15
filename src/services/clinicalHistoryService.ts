import { supabase } from "../lib/supabaseClient";
import { type DeletionMetadata } from "./adminDeletionService";

export type ClinicalNoteType = "historia_base" | "preconsulta" | "procedimiento" | "postconsulta";

export type ClinicalHistoryRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  created_by: string | null;
  doctor_id: string | null;
  session_time: string | null;
  note_type: ClinicalNoteType | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  doctor_profiles?: {
    id: string;
    full_name: string | null;
    specialty: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
  session_title: string | null;
  session_date: string | null;
  reason_for_consultation: string | null;
  medical_history: string | null;
  allergies: string | null;
  current_medications: string | null;
  previous_procedures: string | null;
  diagnosis: string | null;
  treatment_plan: string | null;
  procedure_details: string | null;
  pre_consultation_notes: string | null;
  post_consultation_notes: string | null;
  consent_notes: string | null;
  observations: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicalInventoryUsageRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  item_id: string;
  lot_id: string | null;
  inventory_movement_id: string | null;
  quantity: number;
  unit_label: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  inventory_items?: { name: string | null; unit: string | null; sku: string | null } | null;
  inventory_lots?: { lot_number: string | null; expiration_date: string | null } | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
};

export type ClinicalEvolutionRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  created_by: string | null;
  doctor_id: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  doctor_profiles?: {
    id: string;
    full_name: string | null;
    specialty: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
  title: string;
  description: string;
  treatment_performed: string | null;
  recommendations: string | null;
  created_at: string;
};

const clinicalHistorySelect =
  "*, profiles:created_by(full_name, email, role), doctor_profiles(id, full_name, specialty, whatsapp, email)";

const clinicalEvolutionSelect =
  "*, profiles:created_by(full_name, email, role), doctor_profiles(id, full_name, specialty, whatsapp, email)";

export async function getClinicalHistoryByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_histories")
    .select(clinicalHistorySelect)
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ClinicalHistoryRow | null;
}

export async function getClinicalHistoriesByPatient(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_histories")
    .select(clinicalHistorySelect)
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("session_date", { ascending: false })
    .order("session_time", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalHistoryRow[];
}

export async function getClinicalHistoriesByPatientAndType(patientId: string, noteType: ClinicalNoteType) {
  const { data, error } = await supabase
    .from("clinical_histories")
    .select(clinicalHistorySelect)
    .eq("patient_id", patientId)
    .eq("note_type", noteType)
    .eq("is_deleted", false)
    .order("session_date", { ascending: false })
    .order("session_time", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalHistoryRow[];
}

export async function createClinicalHistory(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("clinical_histories").insert(data).select(clinicalHistorySelect).single();
  if (error) throw error;
  return row as ClinicalHistoryRow;
}

export async function updateClinicalHistory(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("clinical_histories")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(clinicalHistorySelect)
    .single();
  if (error) throw error;
  return row as ClinicalHistoryRow;
}

export async function createClinicalEvolution(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("clinical_evolutions").insert(data).select(clinicalEvolutionSelect).single();
  if (error) throw error;
  return row as ClinicalEvolutionRow;
}

export async function getClinicalEvolutions(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_evolutions")
    .select(clinicalEvolutionSelect)
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalEvolutionRow[];
}

export async function getClinicalInventoryUsages(patientId: string) {
  const { data, error } = await supabase
    .from("clinical_inventory_usages")
    .select("*, inventory_items(name, unit, sku), inventory_lots(lot_number, expiration_date), profiles:created_by(full_name, email, role)")
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClinicalInventoryUsageRow[];
}

export async function recordClinicalInventoryUsage(data: {
  patientId: string;
  clinicalHistoryId?: string | null;
  itemId: string;
  quantity: number;
  lotId?: string | null;
  unitLabel?: string | null;
  notes?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("record_clinical_inventory_usage", {
    p_patient_id: data.patientId,
    p_clinical_history_id: data.clinicalHistoryId ?? null,
    p_item_id: data.itemId,
    p_quantity: data.quantity,
    p_lot_id: data.lotId ?? null,
    p_unit_label: data.unitLabel ?? null,
    p_notes: data.notes ?? null,
  });
  if (error) throw error;
  return row as ClinicalInventoryUsageRow;
}
