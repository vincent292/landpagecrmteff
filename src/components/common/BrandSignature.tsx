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
      <span className="flex h-14 w-14 shrink-0 items-center justify-center sm:h-16 sm:w-16">
        <img
          src="/doctora/logodra.svg"
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
