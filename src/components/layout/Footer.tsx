import { useEffect, useState } from "react";

import { Mail, MapPin, Phone } from "lucide-react";

import { BrandSignature } from "../common/BrandSignature";
import { InstagramIcon } from "../ui/InstagramIcon";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";

export function Footer() {
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  return (
    <footer className="border-t border-[rgba(184,138,90,0.18)] px-6 py-10 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <BrandSignature
            subtitle="Medicina estetica ortomolecular"
            className="max-w-full"
            textClassName="text-[1.5rem] sm:text-[1.7rem]"
            subtitleClassName="tracking-[0.18em]"
            imageClassName="scale-[1.06]"
          />
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {settings?.footer_text ?? "Una experiencia clinica sobria, cercana y pensada para sentirse impecable en cualquier pantalla."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-[var(--color-copy)]">
          {settings?.instagram_url && (
            <a href={settings.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram" className="transition hover:text-[var(--color-ink)]">
              <InstagramIcon className="h-5 w-5" />
            </a>
          )}
          {settings?.tiktok_url && (
            <a href={settings.tiktok_url} target="_blank" rel="noreferrer" aria-label="TikTok" className="text-sm font-semibold transition hover:text-[var(--color-ink)]">
              TikTok
            </a>
          )}
          {settings?.email && (
            <a href={`mailto:${settings.email}`} aria-label="Correo" className="transition hover:text-[var(--color-ink)]">
              <Mail className="h-5 w-5" />
            </a>
          )}
          {settings?.phone && (
            <a href={`tel:${settings.phone}`} aria-label="Telefono" className="transition hover:text-[var(--color-ink)]">
              <Phone className="h-5 w-5" />
            </a>
          )}
          {settings?.maps_url && (
            <a href={settings.maps_url} target="_blank" rel="noreferrer" aria-label="Ubicacion" className="transition hover:text-[var(--color-ink)]">
              <MapPin className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
