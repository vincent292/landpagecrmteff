import { useState } from "react";

import { InfoRequestModal } from "../platform/InfoRequestModal";
import { SectionReveal } from "../ui/SectionReveal";
import { SoftButton } from "../ui/SoftButton";

export function FinalCTA() {
  const [open, setOpen] = useState(false);

  return (
    <SectionReveal id="contacto" className="mx-auto max-w-5xl px-6 py-20 md:px-8 md:py-24">
      <div className="relative overflow-hidden rounded-[36px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.80),rgba(239,229,218,0.94))] p-8 shadow-[0_20px_56px_rgba(110,74,47,0.10)] backdrop-blur-2xl md:p-12">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[rgba(255,249,244,0.34)] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-[rgba(198,162,123,0.16)] blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <p data-reveal className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent-strong)]">
            Reserva o consulta
          </p>

          <h2 data-reveal className="font-display mt-4 text-4xl font-semibold leading-[0.96] text-[var(--color-ink)] md:text-5xl">
            Si ya te intereso algo, da el siguiente paso desde aqui.
          </h2>

          <p data-reveal className="mt-5 text-sm leading-7 text-[var(--color-copy)] md:text-base">
            Deja tus datos para que el equipo te contacte o entra directo a la reserva si ya quieres avanzar hoy.
          </p>

          <div data-reveal className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SoftButton href="/reservar-cita">Reservar ahora</SoftButton>
            <SoftButton onClick={() => setOpen(true)} variant="secondary">
              Pedir informacion
            </SoftButton>
          </div>
        </div>
      </div>

      <InfoRequestModal open={open} interest="Consulta general" onClose={() => setOpen(false)} />
    </SectionReveal>
  );
}
