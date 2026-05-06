import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

export type DoctorProfileRow = DeletionMetadata & {
  id: string;
  profile_id: string | null;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  photo_url: string | null;
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
  return (data ?? []) as DoctorProfileRow[];
}

export async function getAdminDoctors(includeDeleted = false) {
  let query = supabase.from("doctor_profiles").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("doctor_profiles", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DoctorProfileRow[];
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
  return data as DoctorProfileRow | null;
}

export async function createDoctor(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("doctor_profiles").insert(data).select("*").single();
  if (error) throw error;
  return row as DoctorProfileRow;
}

export async function createDoctorWithUser(data: Record<string, unknown>) {
  const { data: result, error } = await supabase.functions.invoke("create-doctor", {
    body: data,
  });
  if (error) throw error;
  if (result?.error) throw new Error(result.error);
  return result as { doctor: DoctorProfileRow; temporary_password: string | null };
}

export async function updateDoctor(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("doctor_profiles").update(data).eq("id", id).select("*").single();
  if (error) throw error;
  return row as DoctorProfileRow;
}

export async function deleteDoctor(id: string) {
  const { error } = await supabase.from("doctor_profiles").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
