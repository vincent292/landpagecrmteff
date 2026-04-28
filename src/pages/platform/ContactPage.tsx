import { useState } from "react";

import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { PageIntro } from "./TreatmentsPage";

export function ContactPage() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Contacto" title="Conversemos sobre el tratamiento, curso o experiencia que necesitas." text="El equipo puede orientarte por WhatsApp, llamada o email según tu preferencia." />
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {["Santa Cruz", "La Paz", "Cochabamba"].map((city) => (
          <div key={city} className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-6">
            <h2 className="text-2xl font-semibold">{city}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">Atención por agenda previa y jornadas especiales.</p>
          </div>
        ))}
      </div>
      <button onClick={() => setOpen(true)} className="mt-10 rounded-full bg-[var(--color-caramel)] px-6 py-3.5 text-sm font-semibold text-white">Solicitar información</button>
      <InfoRequestModal open={open} interest="Contacto general" onClose={() => setOpen(false)} />
    </section>
  );
}
