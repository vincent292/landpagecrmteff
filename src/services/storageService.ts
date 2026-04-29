import { supabase } from "../lib/supabaseClient";

export async function uploadPrivateFile(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;
  return data.path;
}

export async function uploadPublicFile(bucket: string, path: string, file: File) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) throw error;

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return {
    path: data.path,
    publicUrl: publicData.publicUrl,
  };
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 60 * 10) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function uploadImage(bucket: string, path: string, file: File) {
  const { publicUrl } = await uploadPublicFile(bucket, path, file);
  return publicUrl;
}
