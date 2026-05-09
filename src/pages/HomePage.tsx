import { useEffect, useRef, useState } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Footer } from "../components/layout/Footer";
import { PremiumNavbar } from "../components/layout/PremiumNavbar";
import { InfoRequestModal } from "../components/platform/InfoRequestModal";
import { WhatsAppButton } from "../components/platform/WhatsAppButton";
import { AgendaPreviewSection } from "../components/sections/AgendaPreviewSection";
import { DoctorSection } from "../components/sections/DoctorSection";
import { FinalCTA } from "../components/sections/FinalCTA";
import { GalleryPreviewSection } from "../components/sections/GalleryPreviewSection";
import { Hero } from "../components/sections/Hero";
import { Services } from "../components/sections/Services";
import { StickyLeadCTA } from "../components/sections/StickyLeadCTA";
import { TestimonialsSection } from "../components/sections/TestimonialsSection";
import { WelcomeSpotlightModal } from "../components/sections/WelcomeSpotlightModal";

gsap.registerPlugin(ScrollTrigger);

export function HomePage() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const main = mainRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!main || reduceMotion) return;

    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("section:not(#inicio)");

      sections.forEach((section, index) => {
        const target = section.firstElementChild as HTMLElement | null;

        if (!target) return;

        gsap.to(target, {
          yPercent: index % 2 === 0 ? -2.2 : -1.4,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.8,
          },
        });
      });

      gsap.to("[data-page-parallax='line-a']", {
        yPercent: -18,
        ease: "none",
        scrollTrigger: {
          trigger: main,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      gsap.to("[data-page-parallax='line-b']", {
        yPercent: 14,
        ease: "none",
        scrollTrigger: {
          trigger: main,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });
    }, main);

    return () => ctx.revert();
  }, []);

  return (
    <main
      ref={mainRef}
      className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,var(--color-base)_0%,#f6efe7_18%,var(--color-surface)_44%,#f2e7dc_72%,var(--color-surface-soft)_100%)] pb-28 text-[var(--color-ink)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          data-page-parallax="line-a"
          className="absolute left-[6%] top-[22%] h-[38rem] w-px bg-[linear-gradient(180deg,transparent,rgba(154,107,67,0.20),transparent)]"
        />
        <div
          data-page-parallax="line-b"
          className="absolute right-[9%] top-[48%] h-[44rem] w-px bg-[linear-gradient(180deg,transparent,rgba(111,122,96,0.18),transparent)]"
        />
      </div>
      <PremiumNavbar />
      <Hero onRequestInfo={() => setInfoOpen(true)} />
      <Services />
      <AgendaPreviewSection />
      <TestimonialsSection />
      <GalleryPreviewSection />
      <DoctorSection />
      <FinalCTA />
      <Footer />
      <StickyLeadCTA onRequestInfo={() => setInfoOpen(true)} />
      <WelcomeSpotlightModal />
      <InfoRequestModal
        open={infoOpen}
        interest="Consulta general"
        onClose={() => setInfoOpen(false)}
      />
      <WhatsAppButton />
    </main>
  );
}
