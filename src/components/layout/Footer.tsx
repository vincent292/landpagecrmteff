import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";

import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { getDisplayCity } from "../../utils/publicContent";
import { BrandSignature } from "../common/BrandSignature";
import { InstagramIcon } from "../ui/InstagramIcon";

const quickLinks = [
  { label: "Tratamientos", href: "/tratamientos" },
  { label: "Promociones", href: "/promociones" },
  { label: "Cursos", href: "/cursos" },
  { label: "Libros", href: "/libros" },
  { label: "Agenda", href: "/agenda" },
  { label: "Galeria", href: "/galeria" },
  { label: "Contacto", href: "/contacto" },
];

export function Footer() {
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  return (
    <footer className="border-t border-[rgba(184,138,90,0.18)] px-6 py-10 md:px-8 md:py-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr_0.8fr]">
        <div className="max-w-md">
          <BrandSignature
            subtitle="Medicina estetica ortomolecular"
            className="max-w-full"
            textClassName="text-[1.5rem] sm:text-[1.7rem]"
            subtitleClassName="tracking-[0.18em]"
            imageClassName="scale-[1.06]"
          />
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {settings?.footer_text ??
              "Atención médica orientada al bienestar, la armonía facial y el acompañamiento cercano en cada etapa del proceso."}
          </p>
          <p className="mt-4 text-sm font-medium text-[var(--color-ink)]">
            {getDisplayCity(settings?.city)}, Bolivia
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Contacto</p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--color-copy)]">
            <div className="inline-flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-[var(--color-mocha)]" />
              <span>{settings?.address ?? "Ubicación principal configurable desde el panel."}</span>
            </div>
            {settings?.whatsapp || settings?.phone ? (
              <a href={`tel:${settings?.phone ?? settings?.whatsapp ?? ""}`} className="inline-flex items-center gap-3 transition hover:text-[var(--color-ink)]">
                <Phone className="h-4 w-4 text-[var(--color-mocha)]" />
                <span>{settings?.whatsapp ?? settings?.phone}</span>
              </a>
            ) : null}
            {settings?.email ? (
              <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-3 transition hover:text-[var(--color-ink)]">
                <Mail className="h-4 w-4 text-[var(--color-mocha)]" />
                <span>{settings.email}</span>
              </a>
            ) : null}
            <div className="flex items-center gap-4 pt-2 text-[var(--color-copy)]">
              {settings?.instagram_url ? (
                <a href={settings.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram" className="transition hover:text-[var(--color-ink)]">
                  <InstagramIcon className="h-5 w-5" />
                </a>
              ) : null}
              {settings?.tiktok_url ? (
                <a href={settings.tiktok_url} target="_blank" rel="noreferrer" aria-label="TikTok" className="text-sm font-semibold transition hover:text-[var(--color-ink)]">
                  TikTok
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Enlaces rapidos</p>
          <nav className="mt-4 grid gap-2 text-sm text-[var(--color-copy)]">
            {quickLinks.map((item) => (
              <Link key={item.href} to={item.href} className="transition hover:text-[var(--color-ink)]">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-2 border-t border-[rgba(184,138,90,0.14)] pt-6 text-sm text-[var(--color-copy)] sm:flex-row sm:items-center sm:justify-between">
        <span>Dra. Estefany · {getDisplayCity(settings?.city)}, Bolivia</span>
        <span>{new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
