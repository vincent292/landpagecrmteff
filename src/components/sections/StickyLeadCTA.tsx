import { CalendarDays, MessageCircleMore } from "lucide-react";

type StickyLeadCTAProps = {
  onRequestInfo: () => void;
};

export function StickyLeadCTA({ onRequestInfo }: StickyLeadCTAProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] px-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-[28px] border border-[rgba(184,138,90,0.26)] bg-[rgba(255,249,244,0.86)] p-3 shadow-[0_22px_55px_rgba(62,42,31,0.18)] backdrop-blur-2xl">
        <div className="hidden min-w-0 sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Atencion rapida
          </p>
          <p className="mt-1 truncate text-sm text-[var(--color-copy)]">
            Elige si quieres pedir informacion o reservar ahora.
          </p>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onRequestInfo}
            className="flex-1 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--color-ink)] sm:flex-none"
          >
            <span className="inline-flex items-center gap-2">
              <MessageCircleMore className="h-4 w-4" />
              Pedir info
            </span>
          </button>
          <a
            href="/reservar-cita"
            className="flex-1 rounded-full bg-[var(--color-mocha)] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_16px_36px_rgba(62,42,31,0.18)] sm:flex-none"
          >
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Reservar
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
