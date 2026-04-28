import { supabase } from "../lib/supabaseClient";

export async function uploadImage(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) throw error;

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return publicUrl.publicUrl;
}
