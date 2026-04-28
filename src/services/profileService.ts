import { supabase } from "../lib/supabaseClient";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  role: string | null;
  created_at: string;
};

export async function getCurrentProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function getProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateProfileRole(id: string, role: string) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}
