const r2PublicBaseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined;

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function isAbsoluteMediaUrl(value?: string | null) {
  return Boolean(value && /^(https?:)?\/\//i.test(value));
}

export function getPublicMediaUrl(value?: string | null) {
  if (!value) return null;
  if (isAbsoluteMediaUrl(value)) return value;
  if (!r2PublicBaseUrl) return value;
  return `${r2PublicBaseUrl.replace(/\/+$/g, "")}/${trimSlashes(value)}`;
}

export function getMediaKind(value?: string | null) {
  if (!value) return "image";
  const normalized = value.toLowerCase();

  if (normalized.endsWith(".mp4") || normalized.endsWith(".webm") || normalized.includes("/video/")) {
    return "video";
  }

  return "image";
}

export function getFutureR2UploadRequirements() {
  return {
    publicBaseUrlEnv: "VITE_R2_PUBLIC_BASE_URL",
    serverOnlyEnv: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"],
    note: "Las subidas a R2 deben hacerse desde un backend o funcion segura para no exponer claves en el frontend.",
  };
}
