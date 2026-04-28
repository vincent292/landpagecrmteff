import { MessageCircleMore } from "lucide-react";
import { useLocation } from "react-router-dom";

const phone = "59170000000";

export function WhatsAppButton() {
  const { pathname } = useLocation();

  const message = getMessage(pathname);
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(36,120,86)] text-white shadow-[0_18px_45px_rgba(36,120,86,0.32)] transition hover:-translate-y-1 md:h-auto md:w-auto md:gap-2 md:px-5 md:py-3"
      aria-label="Enviar mensaje por WhatsApp"
    >
      <MessageCircleMore className="h-6 w-6" />
      <span className="hidden text-sm font-semibold md:inline">WhatsApp</span>
    </a>
  );
}

function getMessage(pathname: string) {
  if (pathname.startsWith("/tratamientos/")) {
    return "Hola, quiero más información sobre este tratamiento de la Dra. Estefany.";
  }
  if (pathname.startsWith("/cursos/")) {
    return "Hola, quiero más información sobre este curso de la Dra. Estefany.";
  }
  if (pathname.startsWith("/agenda")) {
    return "Hola, quiero más información sobre una actividad de la agenda.";
  }
  return "Hola, quiero más información sobre la atención de la Dra. Estefany Ballesteros.";
}
