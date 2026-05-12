import { ImageWithSkeleton } from "../ui/ImageWithSkeleton";

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
      <ImageWithSkeleton
        src={doctor.photo_url ?? "/doctora/dra1.jpg"}
        fallbackSrc="/doctora/dra1.jpg"
        alt={doctor.full_name}
        loading="eager"
        fetchPriority="high"
        className="h-11 w-11 rounded-full object-cover"
        wrapperClassName="h-11 w-11 overflow-hidden rounded-full ring-1 ring-[rgba(110,74,47,0.12)]"
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
