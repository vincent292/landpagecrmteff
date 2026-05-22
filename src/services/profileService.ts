import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { normalizeDocumentNumber } from "../utils/documentNumber";

export type ProfileRow = DeletionMetadata & {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  document_number?: string | null;
  role: string | null;
  created_at: string;
};

export async function getCurrentProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function getProfiles(includeDeleted = false) {
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("profiles", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateProfileRole(id: string, role: string) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function updateMyProfile(id: string, data: Partial<ProfileRow>) {
  const payload = { ...data };
  if ("document_number" in payload) {
    payload.document_number = normalizeDocumentNumber(payload.document_number);
  }
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) throw error;
}
