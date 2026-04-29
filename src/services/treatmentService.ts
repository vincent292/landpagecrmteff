import { supabase } from "../lib/supabaseClient";

const table = "treatments";

export type TreatmentRow = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  benefits: string | null;
  duration: string | null;
  care_instructions: string | null;
  expected_results: string | null;
  cover_image: string | null;
  city: string | null;
  is_featured: boolean | null;
  is_active: boolean | null;
  created_at: string;
};

export async function getTreatments() {
  const { data, error } = await supabase.from(table).select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TreatmentRow[];
}

export async function getFeaturedTreatments() {
  const { data, error } = await supabase.from(table).select("*").eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TreatmentRow[];
}

export async function getTreatmentBySlug(slug: string) {
  const { data, error } = await supabase.from(table).select("*, treatment_images(*)").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as (TreatmentRow & { treatment_images?: { image_url: string; alt_text?: string | null }[] }) | null;
}

export async function getAdminTreatments() {
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TreatmentRow[];
}

export async function createTreatment(data: Record<string, unknown>) {
  const { error } = await supabase.from(table).insert(data);
  if (error) throw error;
}

export async function updateTreatment(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(data).eq("id", id);
  if (error) throw error;
}

export async function deleteTreatment(id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
