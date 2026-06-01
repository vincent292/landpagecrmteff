import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase as supabaseClient } from "../lib/supabaseClient";

type R2PrivateUploadResponse = {
  key: string;
  size: number;
  contentType: string;
};

type R2PrivateUrlResponse = {
  signedUrl: string;
  path: string;
  expiresIn: number;
};

type R2DeleteResponse = {
  ok: boolean;
  path: string;
};

type R2BookDownloadResponse = {
  signedUrl: string;
  token: string;
  title: string;
  path: string;
};

function resolveFunctionError(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  ) {
    return new Error((data as { error: string }).error);
  }

  return new Error(fallback);
}

async function resolveInvokeError(error: unknown, fallback: string) {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const data = await error.context.clone().json();
      return resolveFunctionError(data, fallback);
    } catch {
      return new Error(fallback);
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

export async function uploadPrivateFileToR2(bucket: string, path: string, file: File) {
  const formData = new FormData();
  formData.set("bucket", bucket);
  formData.set("path", path);
  formData.set("file", file, file.name);

  const { data, error } = await supabaseClient.functions.invoke("r2-upload-private", {
    body: formData,
  });

  if (error) throw await resolveInvokeError(error, "No se pudo subir el archivo privado a Cloudflare R2.");
  if (!data || typeof data !== "object" || !("key" in data)) {
    throw resolveFunctionError(data, "La subida privada a R2 no devolvio una ruta valida.");
  }

  return data as R2PrivateUploadResponse;
}

export async function getPrivateSignedUrlFromR2(
  bucket: string,
  path: string,
  expiresIn = 60 * 10,
  downloadName?: string
) {
  const { data, error } = await supabaseClient.functions.invoke("r2-get-private-url", {
    body: {
      bucket,
      path,
      expiresIn,
      downloadName,
    },
  });

  if (error) throw await resolveInvokeError(error, "No se pudo generar el acceso temporal al archivo.");
  if (!data || typeof data !== "object" || !("signedUrl" in data)) {
    throw resolveFunctionError(data, "No se pudo generar el acceso temporal al archivo.");
  }

  return data as R2PrivateUrlResponse;
}

export async function deleteObjectFromR2(bucket: string, path: string) {
  const { data, error } = await supabaseClient.functions.invoke("r2-delete-object", {
    body: { bucket, path },
  });

  if (error) throw await resolveInvokeError(error, "No se pudo borrar el archivo en R2.");
  if (!data || typeof data !== "object" || !("ok" in data)) {
    throw resolveFunctionError(data, "No se pudo borrar el archivo en R2.");
  }

  return data as R2DeleteResponse;
}

export async function downloadBookFileWithTokenFromR2(token: string, expiresIn = 60 * 5) {
  const { data, error } = await supabaseClient.functions.invoke("r2-download-book-with-token", {
    body: {
      token,
      expiresIn,
    },
  });

  if (error) throw await resolveInvokeError(error, "No se pudo preparar la descarga del libro.");
  if (!data || typeof data !== "object" || !("signedUrl" in data)) {
    throw resolveFunctionError(data, "No se pudo preparar la descarga del libro.");
  }

  return data as R2BookDownloadResponse;
}
