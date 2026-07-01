import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { attachDoctorProfile, attachDoctorProfiles } from "./contentDoctorService";
import { resolvePublicMediaFields } from "./publicMediaResolver";

const table = "treatments";

export type TreatmentRow = DeletionMetadata & {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  public_info?: string | null;
  whatsapp_prefill_message?: string | null;
  benefits: string | null;
  duration: string | null;
  care_instructions: string | null;
  expected_results: string | null;
  cover_image: string | null;
  city: string | null;
  allows_direct_booking?: boolean | null;
  direct_booking_price?: number | null;
  direct_booking_label?: string | null;
  treatment_price?: number | null;
  available_slots?: number | null;
  approved_slots?: number | null;
  allows_partial_payment?: boolean | null;
  partial_payment_percent?: number | null;
  assessment_mode?: "presencial" | "virtual" | "ambas" | null;
  assessment_price?: number | null;
  assessment_price_presencial?: number | null;
  assessment_price_virtual?: number | null;
  is_featured: boolean | null;
  is_active: boolean | null;
  doctor_id: string | null;
  requires_assessment?: boolean | null;
  agenda_mode?: "none" | "coordinate" | "choose_slot" | null;
  appointment_type?: string | null;
  agenda_tag?: string | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
  created_at: string;
};

function resolveTreatment(row: TreatmentRow) {
  return resolvePublicMediaFields(row, ["cover_image"]);
}

export function getTreatmentRemainingSlots(treatment?: Pick<TreatmentRow, "available_slots" | "approved_slots"> | null) {
  if (!treatment) return 0;
  return Math.max(Number(treatment.available_slots ?? 0) - Number(treatment.approved_slots ?? 0), 0);
}

export function hasTreatmentSlotLimit(treatment?: Pick<TreatmentRow, "available_slots"> | null) {
  return Number(treatment?.available_slots ?? 0) > 0;
}

export function getTreatmentOrderPrice(treatment?: Pick<TreatmentRow, "treatment_price" | "direct_booking_price"> | null) {
  return Number(treatment?.treatment_price ?? treatment?.direct_booking_price ?? 0);
}

export async function getTreatments() {
  const { data, error } = await supabase
    .from(table)
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachDoctorProfiles(((data ?? []) as TreatmentRow[]).map(resolveTreatment));
}

export async function getFeaturedTreatments() {
  const { data, error } = await supabase
    .from(table)
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("is_active", true)
    .eq("is_featured", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachDoctorProfiles(((data ?? []) as TreatmentRow[]).map(resolveTreatment));
}

export async function getTreatmentBySlug(slug: string) {
  const { data, error } = await supabase
    .from(table)
    .select("*, treatment_images(*), doctor_profiles(full_name, specialty, photo_url)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return attachDoctorProfile(
    data
      ? {
          ...resolveTreatment(data as TreatmentRow),
          treatment_images: ((data as { treatment_images?: { image_url: string; alt_text?: string | null }[] }).treatment_images ?? []).map((image) =>
            resolvePublicMediaFields(image, ["image_url"])
          ),
        }
      : null
  );
}

export async function getAdminTreatments(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from(table)
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("treatments", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return attachDoctorProfiles(((data ?? []) as TreatmentRow[]).map(resolveTreatment));
}

export async function createTreatment(data: Record<string, unknown>) {
  const { error } = await supabase.from(table).insert(data);
  if (error) throw error;
}

export async function updateTreatment(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(data).eq("id", id);
  if (error) {
    console.error("updateTreatment failed", { id, data, error });
    throw error;
  }
}

export async function deleteTreatment(id: string) {
  const { error } = await supabase.from(table).update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
