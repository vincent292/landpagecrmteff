import { useEffect, useRef } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Quote } from "lucide-react";

import { doctorHighlights, placeholder } from "../../data/landing";

gsap.registerPlugin(ScrollTrigger);

export function DoctorSection() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!section || reduceMotion) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(section);

      gsap.fromTo(
        q("[data-gsap='doctor-reveal']"),
        {
          autoAlpha: 0,
          y: 34,
          clipPath: "inset(10% 0% 18% 0% round 34px)",
          filter: "blur(16px)",
        },
        {
          autoAlpha: 1,
          y: 0,
          clipPath: "inset(0% 0% 0% 0% round 34px)",
          filter: "blur(0px)",
          duration: 1,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            once: true,
          },
        }
      );

      gsap.fromTo(
        q("[data-gsap='doctor-copy'], [data-gsap='doctor-chip']"),
        { autoAlpha: 0, y: 24, filter: "blur(14px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.82,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 68%",
            once: true,
          },
        }
      );

      gsap.to(q("[data-gsap='doctor-main-photo']"), {
        yPercent: -5,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="doctora"
      ref={sectionRef}
      className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-36"
    >
      <div className="grid gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div className="relative min-h-[560px] md:min-h-[680px]">
          <div className="absolute left-8 top-8 h-[82%] w-[72%] rounded-[44px] border border-[rgba(184,138,90,0.16)] bg-[rgba(255,249,244,0.38)]" />
          <div className="absolute bottom-20 right-2 h-52 w-52 rounded-full bg-[rgba(111,122,96,0.12)] blur-3xl" />

          <div
            data-gsap="doctor-reveal"
            className="relative max-w-[440px] overflow-hidden rounded-[34px] border border-[rgba(198,162,123,0.24)] bg-[rgba(255,249,244,0.58)] p-2 shadow-[0_30px_86px_rgba(62,42,31,0.16)] backdrop-blur-2xl"
          >
            <div className="overflow-hidden rounded-[28px]">
              <img
                data-gsap="doctor-main-photo"
                src={placeholder.doctorAlt}
                alt="Retrato editorial de la doctora"
                className="h-[560px] w-full object-cover object-[50%_18%] md:h-[650px]"
              />
            </div>
          </div>

          <div
            data-gsap="doctor-reveal"
            className="absolute right-0 top-20 w-[42%] min-w-[170px] overflow-hidden rounded-[26px] border-[8px] border-[rgba(255,249,244,0.82)] bg-[var(--color-surface)] shadow-[0_24px_60px_rgba(62,42,31,0.18)] md:right-8"
          >
            <img
              src={placeholder.doctor}
              alt="Detalle profesional de la doctora"
              className="h-56 w-full object-cover object-[50%_18%] md:h-72"
            />
          </div>

          <div
            data-gsap="doctor-reveal"
            className="absolute bottom-8 left-6 max-w-sm rounded-[26px] border border-[rgba(198,162,123,0.24)] bg-[rgba(255,249,244,0.76)] p-5 shadow-[0_20px_58px_rgba(62,42,31,0.16)] backdrop-blur-2xl md:left-16"
          >
            <Quote className="h-5 w-5 text-[var(--color-accent-strong)]" />
            <p className="mt-3 font-display text-2xl font-semibold leading-7 text-[var(--color-ink)]">
              Belleza natural con criterio médico, escucha real y una mirada
              profundamente humana.
            </p>
          </div>
        </div>

        <div>
          <p
            data-gsap="doctor-copy"
            className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]"
          >
            Sobre la doctora
          </p>

          <h2
            data-gsap="doctor-copy"
            className="font-display text-5xl font-semibold leading-[0.94] text-[var(--color-ink)] md:text-6xl"
          >
            Un enfoque médico refinado al servicio de tu bienestar y tu imagen.
          </h2>

          <p
            data-gsap="doctor-copy"
            className="mt-6 text-base leading-8 text-[var(--color-copy)] md:text-lg"
          >
            Este espacio está listo para incorporar la biografía profesional de la
            Dra. Estefany Ballesteros, su trayectoria, credenciales, enfoque
            clínico y propuesta diferencial.
          </p>

          <p
            data-gsap="doctor-copy"
            className="mt-5 text-base leading-8 text-[var(--color-copy)] md:text-lg"
          >
            La composición visual está diseñada para transmitir autoridad cálida,
            sensibilidad estética y confianza médica sin caer en excesos visuales.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {doctorHighlights.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.text}
                  data-gsap="doctor-chip"
                  className="flex items-center gap-3 rounded-full border border-[rgba(198,162,123,0.22)] bg-[rgba(255,249,244,0.54)] px-4 py-3 shadow-[0_14px_36px_rgba(110,74,47,0.06)] backdrop-blur-xl"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(111,122,96,0.10)] text-[var(--color-mocha)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-[var(--color-copy)]">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
