type DoctorBylineProps = {
  doctor?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
};

export function DoctorByline({ doctor }: DoctorBylineProps) {
  if (!doctor) return null;

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/65 p-3">
      <img
        src={doctor.photo_url ?? "/doctora/dra1.jpg"}
        alt={doctor.full_name}
        className="h-11 w-11 rounded-full object-cover"
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
          Imparte
        </p>
        <p className="text-sm font-semibold text-[var(--color-ink)]">{doctor.full_name}</p>
        {doctor.specialty ? <p className="text-xs text-[var(--color-copy)]">{doctor.specialty}</p> : null}
      </div>
    </div>
  );
}
