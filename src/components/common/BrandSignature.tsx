import { Link } from "react-router-dom";

import { cn } from "../../lib/cn";

type BrandSignatureProps = {
  className?: string;
  subtitle?: string;
  subtitleClassName?: string;
  textClassName?: string;
  imageClassName?: string;
  to?: string;
};

export function BrandSignature({
  className,
  subtitle,
  subtitleClassName,
  textClassName,
  imageClassName,
  to = "/",
}: BrandSignatureProps) {
  return (
    <Link to={to} className={cn("inline-flex max-w-full items-center gap-3", className)}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(184,138,90,0.20)] bg-[rgba(255,249,244,0.84)] p-2 shadow-[0_10px_30px_rgba(110,74,47,0.10)] backdrop-blur-xl sm:h-14 sm:w-14">
        <img
          src="/doctora/logodra.png"
          alt="Logo Dra. Estefany"
          className={cn("h-full w-full object-contain", imageClassName)}
        />
      </span>

      <span className="min-w-0">
        <span
          className={cn(
            "font-display block truncate text-[1.75rem] font-semibold leading-none text-[var(--color-chocolate)] sm:text-[2rem]",
            textClassName
          )}
        >
          Dra. Estefany
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-1 block truncate text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--color-accent-strong)] sm:text-xs",
              subtitleClassName
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
