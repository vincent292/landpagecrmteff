import { Mail, Phone } from "lucide-react";

import { InstagramIcon } from "../ui/InstagramIcon";

export function Footer() {
  return (
    <footer className="border-t border-[rgba(184,138,90,0.18)] px-6 py-10 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-ink)]">
            Dra. Estefany Ballesteros
          </p>
          <p className="mt-2 text-sm text-[var(--color-copy)]">
            Medicina Estética Ortomolecular
          </p>
        </div>

        <div className="flex items-center gap-5 text-[var(--color-copy)]">
          <a href="#" aria-label="Instagram" className="transition hover:text-[var(--color-ink)]">
            <InstagramIcon className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Correo" className="transition hover:text-[var(--color-ink)]">
            <Mail className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Teléfono" className="transition hover:text-[var(--color-ink)]">
            <Phone className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
