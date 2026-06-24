import { supabase } from "../lib/supabaseClient";
import { sanitizePatientPhone } from "../lib/patientPrivacy";
import type { UserRole } from "../types/platform";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { normalizeDocumentNumber } from "../utils/documentNumber";

export type PatientRow = DeletionMetadata & {
  id: string;
  profile_id: string | null;
  full_name: string;
  document_number?: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  birth_date: string | null;
  gender: string | null;
  emergency_contact: string | null;
  emergency_contact_relationship?: string | null;
  address?: string | null;
  assigned_doctor_id?: string | null;
  notes: string | null;
  created_at: string;
};

export type PortalPatientProfileInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  document_number: string;
  birth_date?: string | null;
  gender?: string | null;
  emergency_contact?: string | null;
  emergency_contact_relationship?: string | null;
  address?: string | null;
  notes?: string | null;
};

export async function getPatients(includeDeleted = false, viewerRole?: UserRole) {
  let query = supabase.from("patients").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("patients", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as PatientRow[]).map((row) => sanitizePatientPhone(row, viewerRole) as PatientRow);
}

export async function getPatientById(id: string, viewerRole?: UserRole) {
  const { data, error } = await supabase.from("patients").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return sanitizePatientPhone(data as PatientRow | null, viewerRole) as PatientRow | null;
}

export async function getPatientByProfileId(profileId: string) {
  const { data, error } = await supabase.from("patients").select("*").eq("profile_id", profileId).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as PatientRow | null;
}

export async function createPatient(data: Record<string, unknown>) {
  const payload = { ...data };
  const normalizedDocument = normalizeDocumentNumber(payload.document_number as string | null | undefined);
  if (!normalizedDocument) throw new Error("El numero de carnet es obligatorio.");
  payload.document_number = normalizedDocument;
  if (typeof payload.email === "string") payload.email = payload.email.trim() || null;
  if (typeof payload.phone === "string") payload.phone = payload.phone.trim() || null;
  if (typeof payload.city === "string") payload.city = payload.city.trim() || null;
  const { data: row, error } = await supabase.from("patients").insert(payload).select("*").single();
  if (error) throw error;
  return row as PatientRow;
}

export async function updatePatient(id: string, data: Record<string, unknown>) {
  const payload = { ...data };
  if ("document_number" in payload) payload.document_number = normalizeDocumentNumber(payload.document_number as string | null | undefined);
  const { data: row, error } = await supabase.from("patients").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return row as PatientRow;
}

export async function upsertMyPatientProfile(data: PortalPatientProfileInput) {
  const { data: row, error } = await supabase.rpc("upsert_patient_profile_from_portal", {
    p_full_name: data.full_name,
    p_phone: data.phone ?? null,
    p_email: data.email ?? null,
    p_city: data.city ?? null,
    p_document_number: normalizeDocumentNumber(data.document_number),
    p_birth_date: data.birth_date ?? null,
    p_gender: data.gender ?? null,
    p_emergency_contact: data.emergency_contact ?? null,
    p_emergency_contact_relationship: data.emergency_contact_relationship ?? null,
    p_address: data.address ?? null,
    p_notes: data.notes ?? null,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "404") {
      throw new Error("Falta aplicar la migracion del portal del paciente en Supabase. Ejecuta npx supabase db push y vuelve a intentar.");
    }
    throw error;
  }

  return (Array.isArray(row) ? row[0] : row) as PatientRow;
}
