import { supabase } from "../lib/supabaseClient";

export type SiteSettingsRow = {
  id: boolean;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  maps_embed_url: string | null;
  payment_qr_image?: string | null;
  payment_qr_updated_at?: string | null;
  payment_qr_updated_by_email?: string | null;
  appointment_qr_payment_image?: string | null;
  course_qr_payment_image?: string | null;
  business_hours?: string | null;
  footer_text: string | null;
  updated_at: string;
};

export type PaymentQrAuditRow = {
  id: string;
  previous_image: string | null;
  next_image: string;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_name: string | null;
  changed_at: string;
  change_reason: string | null;
};

export type PaymentQrSecurityStatus = {
  configured: boolean;
  available: boolean;
};

type PaymentQrSimpleSecurityRow = {
  id: boolean;
  password_hash: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_email: string | null;
};

const fallbackSettings: SiteSettingsRow = {
  id: true,
  phone: null,
  whatsapp: null,
  email: null,
  instagram_url: null,
  tiktok_url: null,
  address: "Consultorio principal",
  city: "Cochabamba",
  maps_url: null,
  maps_embed_url: null,
  payment_qr_image: null,
  payment_qr_updated_at: null,
  payment_qr_updated_by_email: null,
  appointment_qr_payment_image: null,
  course_qr_payment_image: null,
  business_hours: null,
  footer_text: "Una experiencia clinica sobria, cercana y pensada para sentirse impecable en cualquier pantalla.",
  updated_at: new Date().toISOString(),
};

function shouldRetryRequest(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("failed to fetch") || normalized.includes("service unavailable");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hashQrPassword(password: string) {
  const encoded = new TextEncoder().encode(password.trim());
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getCurrentProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const user = userData.user;
  if (!user) throw new Error("Tu sesion expiro. Inicia sesion otra vez.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: (profile?.email as string | null | undefined) ?? user.email ?? null,
    full_name: (profile?.full_name as string | null | undefined) ?? null,
  };
}

async function getSimpleQrSecurityRow() {
  const { data, error } = await supabase
    .from("site_payment_qr_simple_security")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw error;
  }

  return data as PaymentQrSimpleSecurityRow | null;
}

export async function getSiteSettings() {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();

    if (!error) {
      return (data ?? fallbackSettings) as SiteSettingsRow;
    }

    if (error.code === "42P01") return fallbackSettings;

    lastError = error;

    if (!shouldRetryRequest(error.message) || attempt === 2) {
      throw error;
    }

    await sleep(350 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("No se pudieron cargar los ajustes del sitio.");
}

export async function updateSiteSettings(data: Partial<SiteSettingsRow>) {
  const payload = { ...data, id: true };
  const { data: row, error } = await supabase
    .from("site_settings")
    .upsert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return row as SiteSettingsRow;
}

export async function updateGeneralPaymentQr(data: {
  image: string;
  password: string;
  reason?: string;
}) {
  if (!data.image.trim()) {
    throw new Error("Debes subir una imagen QR antes de guardar.");
  }

  const security = await getSimpleQrSecurityRow();
  if (!security) {
    throw new Error("Primero un superadmin debe crear la clave del QR.");
  }

  const passwordHash = await hashQrPassword(data.password);
  if (passwordHash !== security.password_hash) {
    throw new Error("La clave del QR no es valida.");
  }

  const profile = await getCurrentProfile();
  const previousImage = await getSiteSettings();
  const row = await updateSiteSettings({
    payment_qr_image: data.image,
    appointment_qr_payment_image: data.image,
    course_qr_payment_image: data.image,
    payment_qr_updated_at: new Date().toISOString(),
    payment_qr_updated_by_email: profile.email,
  });

  await supabase
    .from("site_payment_qr_audit")
    .insert({
      previous_image: previousImage.payment_qr_image ?? previousImage.course_qr_payment_image ?? previousImage.appointment_qr_payment_image ?? null,
      next_image: data.image,
      changed_by: profile.id,
      changed_by_email: profile.email,
      changed_by_name: profile.full_name,
      change_reason: data.reason?.trim() ? data.reason.trim() : null,
    })
    .throwOnError();

  return row;
}

export async function getPaymentQrSecurityStatus(): Promise<PaymentQrSecurityStatus> {
  const { data, error } = await supabase
    .from("site_payment_qr_simple_security")
    .select("id")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { configured: false, available: false };
    }

    throw error;
  }

  return { configured: Boolean(data), available: true };
}

export async function setPaymentQrPassword(data: {
  newPassword: string;
  currentPassword?: string;
}) {
  const newPassword = data.newPassword.trim();
  if (newPassword.length < 6) {
    throw new Error("La nueva clave debe tener al menos 6 caracteres.");
  }

  const security = await getSimpleQrSecurityRow();
  if (security) {
    const currentHash = await hashQrPassword(data.currentPassword ?? "");
    if (currentHash !== security.password_hash) {
      throw new Error("La clave actual del QR no es valida.");
    }
  }

  const profile = await getCurrentProfile();
  const passwordHash = await hashQrPassword(newPassword);

  const { error } = await supabase
    .from("site_payment_qr_simple_security")
    .upsert({
      id: true,
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
      updated_by_email: profile.email,
    });

  if (error) throw error;
}

export async function getPaymentQrAudit() {
  const { data, error } = await supabase
    .from("site_payment_qr_audit")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(20);
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []) as PaymentQrAuditRow[];
}
