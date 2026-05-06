import { SectionReveal } from "../ui/SectionReveal";
import { SoftButton } from "../ui/SoftButton";

export function FinalCTA() {
  return (
    <SectionReveal id="contacto" className="mx-auto max-w-5xl px-6 py-20 md:px-8 md:py-24">
      <div className="relative overflow-hidden rounded-[36px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.80),rgba(239,229,218,0.94))] p-8 shadow-[0_20px_56px_rgba(110,74,47,0.10)] backdrop-blur-2xl md:p-12">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[rgba(255,249,244,0.34)] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-[rgba(198,162,123,0.16)] blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <p data-reveal className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent-strong)]">
            Encuentranos
          </p>

          <h2 data-reveal className="font-display mt-4 text-4xl font-semibold leading-[0.96] text-[var(--color-ink)] md:text-5xl">
            Tu primera consulta empieza con una ubicación clara y un canal directo para orientarte.
          </h2>

          <p data-reveal className="mt-5 text-sm leading-7 text-[var(--color-copy)] md:text-base">
            Revisa la dirección principal, abre el mapa y contáctanos si necesitas ayuda antes de reservar.
          </p>

          <div data-reveal className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SoftButton href="/contacto">Ir a contacto</SoftButton>
            <SoftButton href="#inicio" variant="secondary">
              Volver al inicio
            </SoftButton>
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}
