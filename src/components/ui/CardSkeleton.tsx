import { cn } from "../../lib/cn";

type CardSkeletonProps = {
  variant?: "default" | "wide";
  className?: string;
};

export function CardSkeleton({ variant = "default", className = "" }: CardSkeletonProps) {
  return (
    <article
      aria-hidden="true"
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white/55 shadow-[0_18px_48px_rgba(110,74,47,0.06)] sm:rounded-[28px]",
        variant === "wide" && "lg:grid lg:grid-cols-[0.9fr_1.1fr]",
        className
      )}
    >
      <div className={cn("skeleton-shimmer h-56 w-full", variant === "wide" ? "sm:h-64 lg:h-full lg:min-h-[18rem]" : "sm:h-64")} />
      <div className="space-y-4 p-5 sm:p-6">
        <div className="skeleton-shimmer h-3 w-24 rounded-full" />
        <div className="skeleton-shimmer h-7 w-4/5 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-3 w-full rounded-full" />
          <div className="skeleton-shimmer h-3 w-11/12 rounded-full" />
          <div className="skeleton-shimmer h-3 w-2/3 rounded-full" />
        </div>
        <div className="skeleton-shimmer h-8 w-36 rounded-full" />
        <div className="skeleton-shimmer h-11 w-full max-w-[220px] rounded-full" />
      </div>
    </article>
  );
}
