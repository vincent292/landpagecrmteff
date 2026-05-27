import { useId, useState } from "react";

import { ImageWithSkeleton } from "./ImageWithSkeleton";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string | null;
  afterLabel?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Antes",
  afterLabel = "Despues",
  alt = "Comparacion antes y despues",
  className = "",
  imageClassName = "",
}: BeforeAfterSliderProps) {
  const inputId = useId();
  const [position, setPosition] = useState(50);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-[rgba(247,242,236,0.72)]">
        <ImageWithSkeleton
          src={beforeSrc}
          alt={`${alt} - antes`}
          loading="lazy"
          className={`h-full w-full object-cover ${imageClassName}`}
        />
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <ImageWithSkeleton
            src={afterSrc}
            alt={`${alt} - despues`}
            loading="lazy"
            className={`h-full w-full object-cover ${imageClassName}`}
          />
        </div>

        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${position}%` }}>
          <div className="absolute inset-y-0 -translate-x-1/2 border-l-2 border-white/90 shadow-[0_0_0_1px_rgba(84,56,38,0.14)]" />
          <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[var(--color-mocha)] shadow-[0_14px_30px_rgba(62,42,31,0.18)]">
            <span className="text-xs font-black tracking-[0.24em]">|||</span>
          </div>
        </div>

        <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-[rgba(32,22,16,0.68)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
          {beforeLabel}
        </div>
        <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-[rgba(32,22,16,0.68)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
          {afterLabel}
        </div>
      </div>

      <label htmlFor={inputId} className="sr-only">
        Mover comparacion
      </label>
      <input
        id={inputId}
        type="range"
        min="0"
        max="100"
        step="1"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        aria-label="Mover comparacion antes y despues"
      />
    </div>
  );
}
