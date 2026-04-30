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
  footer_text: "Una experiencia clinica sobria, cercana y pensada para sentirse impecable en cualquier pantalla.",
  updated_at: new Date().toISOString(),
};

export async function getSiteSettings() {
  const { data, error } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    if (error.code === "42P01") return fallbackSettings;
    throw error;
  }
  return (data ?? fallbackSettings) as SiteSettingsRow;
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
