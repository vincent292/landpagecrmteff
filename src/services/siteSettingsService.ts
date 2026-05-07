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
  appointment_qr_payment_image?: string | null;
  business_hours?: string | null;
  footer_text: string | null;
  updated_at: string;
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
  appointment_qr_payment_image: null,
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
