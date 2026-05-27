import { MessageCircleMore } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { buildWhatsAppHref } from "../../utils/whatsapp";

type FloatingWhatsappSettings = Pick<SiteSettingsRow, "whatsapp" | "show_whatsapp_button">;

export function WhatsAppButton() {
  const { pathname } = useLocation();
  const [settings, setSettings] = useState<FloatingWhatsappSettings | null>(null);

  useEffect(() => {
    getSiteSettings()
      .then((row) =>
        setSettings({
          whatsapp: row.whatsapp,
          show_whatsapp_button: row.show_whatsapp_button ?? false,
        })
      )
      .catch(() => setSettings(null));
  }, []);

  if (!settings?.show_whatsapp_button || !settings.whatsapp) {
    return null;
  }

  const message = getMessage(pathname);
  const href = buildWhatsAppHref(settings.whatsapp, message);
  const floatingPosition = pathname.startsWith("/cursos/") ? "bottom-24 md:bottom-5" : "bottom-5";

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(36,120,86)] text-white shadow-[0_18px_45px_rgba(36,120,86,0.32)] transition hover:-translate-y-1 md:h-auto md:w-auto md:gap-2 md:px-5 md:py-3 ${floatingPosition}`}
      aria-label="Enviar mensaje por WhatsApp"
    >
      <MessageCircleMore className="h-6 w-6" />
      <span className="hidden text-sm font-semibold md:inline">WhatsApp</span>
    </a>
  );
}

function getMessage(pathname: string) {
  if (pathname.startsWith("/tratamientos/")) {
    return "Hola, quiero mas informacion sobre este tratamiento de la Dra. Estefany.";
  }
  if (pathname.startsWith("/cursos/")) {
    return "Hola, quiero mas informacion sobre este curso de la Dra. Estefany.";
  }
  if (pathname.startsWith("/agenda")) {
    return "Hola, quiero mas informacion sobre una actividad de la agenda.";
  }
  return "Hola, quiero mas informacion sobre la atencion de la Dra. Estefany Ballesteros.";
}
