import { supabase } from "../lib/supabaseClient";

export async function getMyActiveBooks(userId: string) {
  const { data, error } = await supabase
    .from("book_download_tokens")
    .select("*, books(title, cover_image)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
