import { BrandSignature } from "./BrandSignature";

export function RouteLoadingScreen({
  label = "Preparando la siguiente vista...",
}: {
  label?: string;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbf7f2_0%,#f4ebe1_100%)] px-6 py-10 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-3xl rounded-[36px] border border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.78)] p-6 shadow-[0_28px_90px_rgba(62,42,31,0.12)] backdrop-blur-2xl md:p-8">
          <BrandSignature
            subtitle="Estetica medica"
            textClassName="text-[1.65rem] sm:text-[1.9rem]"
            subtitleClassName="tracking-[0.16em]"
          />
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
            Cargando
          </p>
          <h2 className="font-display mt-3 text-4xl font-semibold text-[var(--color-ink)] md:text-5xl">
            {label}
          </h2>
          <div className="mt-8 grid gap-4">
            <div className="skeleton-shimmer h-6 rounded-full" />
            <div className="skeleton-shimmer h-24 rounded-[24px]" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="skeleton-shimmer h-40 rounded-[28px]" />
              <div className="skeleton-shimmer h-40 rounded-[28px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
