import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { resolvePublicMediaFields } from "./publicMediaResolver";

export type DoctorProfileRow = DeletionMetadata & {
  id: string;
  profile_id: string | null;
  full_name: string;
  document_number: string | null;
  specialty: string | null;
  bio: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  photo_url: string | null;
  access_role: "doctor" | "doctor_inventory";
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getDoctors() {
  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DoctorProfileRow[]).map((row) =>
    resolvePublicMediaFields(row, ["photo_url"])
  );
}

export async function getAdminDoctors(includeDeleted = false) {
  let query = supabase.from("doctor_profiles").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("doctor_profiles", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as DoctorProfileRow[]).map((row) =>
    resolvePublicMediaFields(row, ["photo_url"])
  );
}

export async function getMyDoctorProfile(profileId: string) {
  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? resolvePublicMediaFields(data as DoctorProfileRow, ["photo_url"]) : null;
}

export async function createDoctor(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("doctor_profiles").insert(data).select("*").single();
  if (error) throw error;
  return resolvePublicMediaFields(row as DoctorProfileRow, ["photo_url"]);
}

export async function updateDoctor(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("doctor_profiles").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return resolvePublicMediaFields(row as DoctorProfileRow, ["photo_url"]);
}

export async function updateMyDoctorProfile(data: {
  fullName: string;
  specialty?: string | null;
  bio?: string | null;
  city?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  photoUrl?: string | null;
}) {
  const { data: row, error } = await supabase.rpc("update_my_doctor_profile", {
    p_full_name: data.fullName,
    p_specialty: data.specialty ?? null,
    p_bio: data.bio ?? null,
    p_city: data.city ?? null,
    p_phone: data.phone ?? null,
    p_whatsapp: data.whatsapp ?? null,
    p_email: data.email ?? null,
    p_instagram_url: data.instagramUrl ?? null,
    p_tiktok_url: data.tiktokUrl ?? null,
    p_photo_url: data.photoUrl ?? null,
  });
  if (error) throw error;
  return resolvePublicMediaFields(row as DoctorProfileRow, ["photo_url"]);
}

export async function deleteDoctor(id: string) {
  const { error } = await supabase.from("doctor_profiles").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
