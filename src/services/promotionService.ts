import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { attachDoctorProfile, attachDoctorProfiles } from "./contentDoctorService";

export type PromotionRow = DeletionMetadata & {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  old_price: number | null;
  promo_price: number | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  available_slots: number | null;
  is_active: boolean | null;
  doctor_id: string | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
  created_at: string;
};

export async function getActivePromotions() {
  const { data, error } = await supabase.from("promotions").select("*, doctor_profiles(full_name, specialty, photo_url)").eq("is_active", true).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return attachDoctorProfiles((data ?? []) as PromotionRow[]);
}

export async function getPromotionBySlug(slug: string) {
  const { data, error } = await supabase
    .from("promotions")
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return attachDoctorProfile(data as PromotionRow | null);
}

export async function getAdminPromotions(includeDeleted = false) {
  let query = supabase.from("promotions").select("*, doctor_profiles(full_name, specialty, photo_url)").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("promotions", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return attachDoctorProfiles((data ?? []) as PromotionRow[]);
}

export async function createPromotion(data: Record<string, unknown>) {
  const { error } = await supabase.from("promotions").insert(data);
  if (error) throw error;
}

export async function updatePromotion(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("promotions").update(data).eq("id", id);
  if (error) throw error;
}

export async function deletePromotion(id: string) {
  const { error } = await supabase.from("promotions").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}
