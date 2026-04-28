import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.62)] backdrop-blur-2xl",
        "shadow-[0_20px_60px_rgba(110,74,47,0.10),inset_0_1px_0_rgba(255,255,255,0.45)]",
        className
      )}
    >
      {children}
    </div>
  );
}
