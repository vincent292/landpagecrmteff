import { useEffect, useState } from "react";

import { Mail, MapPin, MessageCircleMore, Phone } from "lucide-react";

import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { PageIntro } from "./TreatmentsPage";

export function ContactPage() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettingsRow | null>(null);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro
        eyebrow="Encuentranos"
        title="Tu valoracion comienza en un espacio privado, claro y facil de ubicar."
        text="Desde aqui puedes revisar la direccion, abrir Google Maps o pedir orientacion al equipo antes de agendar."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[30px] border border-[var(--color-border)] bg-white/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
            Consultorio principal
          </p>
          <h2 className="mt-3 text-2xl font-semibold">{settings?.city ?? "Cochabamba"}</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            {settings?.address ?? "Direccion pendiente de configurar desde el panel."}
          </p>

          <div className="mt-6 grid gap-3">
            {settings?.phone && <ContactLink icon={<Phone className="h-4 w-4" />} href={`tel:${settings.phone}`} label={settings.phone} />}
            {settings?.email && <ContactLink icon={<Mail className="h-4 w-4" />} href={`mailto:${settings.email}`} label={settings.email} />}
            {settings?.whatsapp && (
              <ContactLink icon={<MessageCircleMore className="h-4 w-4" />} href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} label="WhatsApp del equipo" external />
            )}
            {settings?.maps_url && <ContactLink icon={<MapPin className="h-4 w-4" />} href={settings.maps_url} label="Abrir en Google Maps" external />}
          </div>

          <button onClick={() => setOpen(true)} className="mt-8 rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white">
            Pedir orientacion
          </button>
        </div>

        <div className="min-h-[360px] overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/70">
          {settings?.maps_embed_url ? (
            <iframe
              src={settings.maps_embed_url}
              title="Ubicacion del consultorio"
              className="h-full min-h-[360px] w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center p-8 text-center text-sm leading-7 text-[var(--color-copy)]">
              Agrega el enlace embed de Google Maps desde Configuracion para mostrar el mapa aqui.
            </div>
          )}
        </div>
      </div>

      <InfoRequestModal open={open} interest="Ubicacion y contacto" onClose={() => setOpen(false)} />
    </section>
  );
}

function ContactLink({ icon, href, label, external = false }: { icon: React.ReactNode; href: string; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold"
    >
      {icon}
      {label}
    </a>
  );
}
