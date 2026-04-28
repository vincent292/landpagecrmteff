import { cn } from "../../lib/cn";

type Align = "left" | "center";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: Align;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-accent-strong)]">
          {eyebrow}
        </p>
      )}

      <h2 className="font-display text-4xl font-semibold leading-[0.94] text-[var(--color-ink)] md:text-6xl">
        {title}
      </h2>

      {description && (
        <p className="mt-5 text-base leading-8 text-[var(--color-copy)] md:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
