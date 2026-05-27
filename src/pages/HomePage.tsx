import { lazy, Suspense, useEffect, useRef, useState } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Footer } from "../components/layout/Footer";
import { PremiumNavbar } from "../components/layout/PremiumNavbar";
import { Seo } from "../components/common/Seo";
import { InfoRequestModal } from "../components/platform/InfoRequestModal";
import { Hero } from "../components/sections/Hero";
import { Services } from "../components/sections/Services";
import { StickyLeadCTA } from "../components/sections/StickyLeadCTA";
import { WelcomeSpotlightModal } from "../components/sections/WelcomeSpotlightModal";

gsap.registerPlugin(ScrollTrigger);

const AgendaPreviewSection = lazy(() =>
  import("../components/sections/AgendaPreviewSection").then((module) => ({
    default: module.AgendaPreviewSection,
  }))
);
const DoctorSection = lazy(() =>
  import("../components/sections/DoctorSection").then((module) => ({
    default: module.DoctorSection,
  }))
);
const FinalCTA = lazy(() =>
  import("../components/sections/FinalCTA").then((module) => ({
    default: module.FinalCTA,
  }))
);
const GalleryPreviewSection = lazy(() =>
  import("../components/sections/GalleryPreviewSection").then((module) => ({
    default: module.GalleryPreviewSection,
  }))
);
const TestimonialsSection = lazy(() =>
  import("../components/sections/TestimonialsSection").then((module) => ({
    default: module.TestimonialsSection,
  }))
);

export function HomePage() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const main = mainRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!main || reduceMotion) return;

    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("section:not(#inicio)");
      const lineA = gsap.utils.toArray<HTMLElement>("[data-page-parallax='line-a']");
      const lineB = gsap.utils.toArray<HTMLElement>("[data-page-parallax='line-b']");

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

      if (lineA.length > 0) {
        gsap.to(lineA, {
          yPercent: -18,
          ease: "none",
          scrollTrigger: {
            trigger: main,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
          },
        });
      }

      if (lineB.length > 0) {
        gsap.to(lineB, {
          yPercent: 14,
          ease: "none",
          scrollTrigger: {
            trigger: main,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
          },
        });
      }
    }, main);

    return () => ctx.revert();
  }, []);

  return (
    <main
      ref={mainRef}
      className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,var(--color-base)_0%,#f6efe7_18%,var(--color-surface)_44%,#f2e7dc_72%,var(--color-surface-soft)_100%)] pb-28 text-[var(--color-ink)]"
    >
      <Seo
        title="Dra. Estefany Ballesteros | Medicina estetica ortomolecular en Bolivia"
        description="Tratamientos esteticos, promociones, cursos, agenda y galeria de Dra. Estefany Ballesteros. Medicina estetica ortomolecular con atencion clara y cercana."
        path="/"
        image="/doctora/dra1.jpg"
        keywords={["tratamientos esteticos Bolivia", "armonizacion facial", "agenda medica estetica", "doctora estetica Cochabamba"]}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Physician",
            name: "Dra. Estefany Ballesteros",
            medicalSpecialty: "Aesthetic Medicine",
            areaServed: "Bolivia",
            url: typeof window !== "undefined" ? `${window.location.origin}/` : "/",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Dra. Estefany Ballesteros",
            url: typeof window !== "undefined" ? window.location.origin : "/",
          },
        ]}
      />
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
      <Suspense fallback={<SectionSkeleton label="Cargando contenido destacado..." />}>
        <AgendaPreviewSection />
        <TestimonialsSection />
        <GalleryPreviewSection />
        <DoctorSection />
        <FinalCTA />
      </Suspense>
      <Footer />
      <StickyLeadCTA onRequestInfo={() => setInfoOpen(true)} />
      <WelcomeSpotlightModal />
      <InfoRequestModal
        open={infoOpen}
        interest="Consulta general"
        onClose={() => setInfoOpen(false)}
      />
    </main>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:px-8 md:py-24">
      <div className="rounded-[32px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.72)] p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-center text-sm font-medium text-[var(--color-copy)]">{label}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="skeleton-shimmer h-56 rounded-[28px]" />
          <div className="skeleton-shimmer h-56 rounded-[28px]" />
          <div className="skeleton-shimmer h-56 rounded-[28px]" />
        </div>
      </div>
    </section>
  );
}
