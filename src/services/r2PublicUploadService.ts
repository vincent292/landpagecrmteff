import { supabase } from "../lib/supabaseClient";
import { getPublicMediaUrl } from "./mediaStorageService";

type R2PublicUploadResponse = {
  key: string;
  size: number;
  contentType: string;
};

export async function uploadPublicFileToR2(path: string, file: File) {
  const formData = new FormData();
  formData.set("path", path);
  formData.set("file", file, file.name);

  const { data, error } = await supabase.functions.invoke("r2-upload-public", {
    body: formData,
  });

  if (error) throw error;

  const payload = data as R2PublicUploadResponse | null;
  if (!payload?.key) {
    throw new Error("La subida a R2 no devolvio una ruta valida.");
  }

  return {
    path: payload.key,
    publicUrl: getPublicMediaUrl(payload.key) ?? payload.key,
    size: payload.size,
    contentType: payload.contentType,
  };
}
