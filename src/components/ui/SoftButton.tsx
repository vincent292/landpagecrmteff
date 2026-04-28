import type { ReactNode } from "react";

import { ArrowRight } from "lucide-react";

import { cn } from "../../lib/cn";

type SoftButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary";
};

export function SoftButton({
  children,
  href = "#contacto",
  variant = "primary",
}: SoftButtonProps) {
  const base =
    "group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-3.5 text-sm font-semibold tracking-[0.03em] transition-all duration-500 active:scale-[0.98]";

  const styles =
    variant === "primary"
      ? "border border-[rgba(184,138,90,0.34)] bg-[var(--color-caramel)] text-[var(--color-surface)] shadow-[0_18px_40px_rgba(110,74,47,0.18)] hover:-translate-y-1 hover:bg-[var(--color-mocha)] hover:shadow-[0_24px_52px_rgba(62,42,31,0.24)]"
      : "border border-[var(--color-border)] bg-[rgba(255,249,244,0.52)] text-[var(--color-ink)] shadow-[0_16px_40px_rgba(110,74,47,0.08)] backdrop-blur-xl hover:-translate-y-1 hover:bg-[rgba(255,249,244,0.76)]";

  return (
    <a href={href} className={cn(base, styles)}>
      <span className="absolute inset-y-0 left-[-140%] w-[70%] -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)] opacity-0 transition-all duration-700 group-hover:left-[155%] group-hover:opacity-100" />
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  );
}
