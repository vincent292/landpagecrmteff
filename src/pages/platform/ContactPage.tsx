import { useEffect, useState } from "react";
import { Clock3, Mail, MapPin, MessageCircleMore, Phone } from "lucide-react";

import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { getDisplayCity, getMapEmbedUrl } from "../../utils/publicContent";
import { PageIntro } from "./TreatmentsPage";

export function ContactPage() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const embedUrl = getMapEmbedUrl(settings?.maps_embed_url, settings?.maps_url);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro
        eyebrow="Contacto"
        title="Un punto de contacto claro para resolver dudas, ubicar el consultorio y coordinar tu atención."
        text="Aquí encontrarás la información principal del consultorio, el mapa y los canales recomendados para recibir orientación antes de reservar."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Consultorio principal
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">
              {getDisplayCity(settings?.city)}, Bolivia
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              {settings?.address ?? "Ubicación principal pendiente de configuración desde el panel."}
            </p>

            <div className="mt-6 grid gap-3">
              {settings?.phone ? (
                <ContactLink icon={<Phone className="h-4 w-4" />} href={`tel:${settings.phone}`} label={settings.phone} />
              ) : null}
              {settings?.whatsapp ? (
                <ContactLink
                  icon={<MessageCircleMore className="h-4 w-4" />}
                  href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
                  label={settings.whatsapp}
                  external
                />
              ) : null}
              {settings?.email ? (
                <ContactLink icon={<Mail className="h-4 w-4" />} href={`mailto:${settings.email}`} label={settings.email} />
              ) : null}
              {settings?.maps_url ? (
                <ContactLink icon={<MapPin className="h-4 w-4" />} href={settings.maps_url} label="Abrir en Google Maps" external />
              ) : null}
            </div>
          </div>

          <div className="rounded-[30px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
              Horarios y coordinación
            </p>
            <div className="mt-4 inline-flex items-start gap-3 text-sm leading-7 text-[var(--color-copy)]">
              <Clock3 className="mt-1 h-4 w-4 text-[var(--color-mocha)]" />
              <span>{settings?.business_hours ?? "La atención se coordina previamente por WhatsApp o por el canal de contacto indicado."}</span>
            </div>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-8 rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white"
            >
              Pedir orientación
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/70 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <iframe
            src={embedUrl}
            title="Ubicación del consultorio"
            className="h-[360px] w-full md:h-[100%] md:min-h-[520px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      <InfoRequestModal open={open} interest="Ubicacion y contacto" onClose={() => setOpen(false)} />
    </section>
  );
}

function ContactLink({
  icon,
  href,
  label,
  external = false,
}: {
  icon: React.ReactNode;
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-white"
    >
      {icon}
      {label}
    </a>
  );
}
