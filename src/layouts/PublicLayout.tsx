import { useEffect, useRef } from "react";

import { Outlet, useLocation } from "react-router-dom";

import { Footer } from "../components/layout/Footer";
import { PremiumNavbar } from "../components/layout/PremiumNavbar";
import { WhatsAppButton } from "../components/platform/WhatsAppButton";

export function PublicLayout() {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (!contentRef.current) return;

    let active = true;
    let context: { revert: () => void } | null = null;

    void import("gsap").then(({ default: gsap }) => {
      if (!active || !contentRef.current) return;

      context = gsap.context(() => {
        const elements = gsap.utils.toArray<HTMLElement>(
          "h1, h2, section > p, article, aside, form, .premium-input, img"
        );

        gsap.fromTo(
          elements.slice(0, 18),
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.62,
            ease: "power2.out",
            stagger: 0.045,
          }
        );
      }, contentRef);
    });

    return () => {
      active = false;
      context?.revert();
    };
  }, [location.pathname]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-base)_0%,#fff9f4_48%,var(--color-surface-soft)_100%)] text-[var(--color-ink)]">
      <PremiumNavbar />
      <div ref={contentRef} className="pt-24 sm:pt-28">
        <Outlet />
      </div>
      <Footer />
      <WhatsAppButton />
    </main>
  );
}
