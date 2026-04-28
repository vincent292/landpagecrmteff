import { useEffect, useState } from "react";

import { navLinks } from "../../data/landing";
import { cn } from "../../lib/cn";

export function PremiumNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);

    onScroll();
    window.addEventListener("scroll", onScroll);

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4 md:px-6">
      <div className="relative mx-auto max-w-7xl">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[26px] transition-all duration-500 sm:rounded-full",
            scrolled
              ? "bg-[radial-gradient(circle_at_top,rgba(255,249,244,0.52),transparent_62%)] blur-xl"
              : "bg-[radial-gradient(circle_at_top,rgba(255,249,244,0.34),transparent_62%)] blur-2xl"
          )}
        />

        <div
          className={cn(
            "relative flex items-center justify-between rounded-[26px] border px-3.5 py-2.5 transition-all duration-500 sm:rounded-full sm:px-5 sm:py-3 md:px-6",
            scrolled
              ? "border-[rgba(184,138,90,0.20)] bg-[rgba(255,249,244,0.74)] shadow-[0_18px_45px_rgba(110,74,47,0.10)] backdrop-blur-[22px] backdrop-saturate-150"
              : "border-[rgba(184,138,90,0.16)] bg-[rgba(255,249,244,0.42)] shadow-[0_10px_30px_rgba(110,74,47,0.06)] backdrop-blur-[18px] backdrop-saturate-140"
          )}
        >
          <a
            href="/"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-chocolate)] sm:text-sm sm:tracking-[0.24em]"
          >
            DRA. ESTEFANY
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-[var(--color-copy)] transition-colors duration-300 hover:text-[var(--color-ink)]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a
            href="/agendar"
            className="rounded-full border border-[rgba(184,138,90,0.30)] bg-[var(--color-caramel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-surface)] shadow-[0_12px_24px_rgba(110,74,47,0.14)] transition duration-500 hover:-translate-y-0.5 hover:bg-[var(--color-mocha)] sm:px-4 sm:py-2 sm:text-sm sm:shadow-[0_18px_35px_rgba(110,74,47,0.18)]"
          >
            <span className="sm:hidden">Agendar</span>
            <span className="hidden sm:inline">Agendar valoración</span>
          </a>
        </div>
      </div>
    </div>
  );
}
