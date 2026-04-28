export function LoadingState({ label = "Cargando información..." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-8 text-center text-sm text-[var(--color-copy)]">
      {label}
    </div>
  );
}

export function ErrorState({ label = "No pudimos cargar la información." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
      {label}
    </div>
  );
}

export function EmptyState({ label = "Todavía no hay resultados publicados." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-white/60 p-8 text-center text-sm text-[var(--color-copy)]">
      {label}
    </div>
  );
}
