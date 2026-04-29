import { SectionReveal } from "../ui/SectionReveal";
import { SoftButton } from "../ui/SoftButton";

export function FinalCTA() {
  return (
    <SectionReveal
      id="contacto"
      className="mx-auto max-w-6xl px-6 py-28 md:px-8 md:py-36"
    >
      <div className="relative overflow-hidden rounded-[40px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.78),rgba(239,229,218,0.92))] p-10 shadow-[0_24px_70px_rgba(110,74,47,0.10)] backdrop-blur-2xl md:p-16">
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-[rgba(255,249,244,0.34)] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-[rgba(198,162,123,0.16)] blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent-strong)]">
            Agenda tu experiencia
          </p>

          <h2 className="font-display mt-5 text-5xl font-semibold leading-[0.94] text-[var(--color-ink)] md:text-6xl">
            Un cuidado estÃ©tico premium comienza con una valoraciÃ³n personalizada.
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--color-copy)] md:text-lg">
            Desde esta vista podrÃ¡s elegir horario, realizar el pago por QR y subir
            tu comprobante para validaciÃ³n manual.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <SoftButton href="/contacto">Pedir información</SoftButton>
            <SoftButton href="#inicio" variant="secondary">
              Volver al inicio
            </SoftButton>
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}



