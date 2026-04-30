import { Mail, Phone } from "lucide-react";

import { BrandSignature } from "../common/BrandSignature";
import { InstagramIcon } from "../ui/InstagramIcon";

export function Footer() {
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
            Una experiencia clínica sobria, cercana y pensada para sentirse impecable en cualquier pantalla.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-[var(--color-copy)]">
          <a href="#" aria-label="Instagram" className="transition hover:text-[var(--color-ink)]">
            <InstagramIcon className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Correo" className="transition hover:text-[var(--color-ink)]">
            <Mail className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Telefono" className="transition hover:text-[var(--color-ink)]">
            <Phone className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
