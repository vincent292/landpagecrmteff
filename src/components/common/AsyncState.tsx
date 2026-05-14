export function LoadingState({ label = "Cargando informacion..." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.06)]">
      <div className="mx-auto max-w-2xl">
        <p className="text-center text-sm font-medium text-[var(--color-copy)]">{label}</p>
        <div className="mt-5 grid gap-4">
          <div className="skeleton-shimmer h-5 rounded-full" />
          <div className="skeleton-shimmer h-24 rounded-[22px]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="skeleton-shimmer h-32 rounded-[24px]" />
            <div className="skeleton-shimmer h-32 rounded-[24px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ label = "No pudimos cargar la informacion." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
      {label}
    </div>
  );
}

export function EmptyState({ label = "Todavia no hay resultados publicados." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-8 text-center text-sm text-[var(--color-copy)]">
      {label}
    </div>
  );
}
