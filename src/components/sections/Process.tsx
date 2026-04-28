import { useEffect, useRef } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { placeholder, processSteps } from "../../data/landing";
import { GlassCard } from "../ui/GlassCard";
import { SoftButton } from "../ui/SoftButton";

gsap.registerPlugin(ScrollTrigger);

export function Process() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!section || reduceMotion) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(section);

      gsap.fromTo(
        q("[data-gsap='process-badge'], [data-gsap='process-title'], [data-gsap='process-body'], [data-gsap='process-cta']"),
        { autoAlpha: 0, y: 28, filter: "blur(18px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.95,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 72%",
            once: true,
          },
        }
      );

      gsap.fromTo(
        q("[data-gsap='process-step']"),
        { autoAlpha: 0, y: 24, filter: "blur(14px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.8,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 66%",
            once: true,
          },
        }
      );

      gsap.fromTo(
        q("[data-gsap='process-image']"),
        {
          autoAlpha: 0,
          x: -32,
          clipPath: "inset(12% 10% 12% 10% round 34px)",
          filter: "blur(18px)",
        },
        {
          autoAlpha: 1,
          x: 0,
          clipPath: "inset(0% 0% 0% 0% round 34px)",
          filter: "blur(0px)",
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 72%",
            once: true,
          },
        }
      );

      gsap.to(q("[data-gsap='process-image']"), {
        yPercent: -6,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.to(q("[data-gsap='process-photo']"), {
        scale: 1.06,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.to(q("[data-gsap='process-orb']"), {
        yPercent: -14,
        xPercent: 8,
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
      id="proceso"
      ref={sectionRef}
      className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-36"
    >
      <div className="relative overflow-hidden rounded-[36px] border border-[rgba(184,138,90,0.18)] bg-[linear-gradient(135deg,#FFFBF6_0%,#EFE5DA_48%,#D8C2AE_100%)] p-5 shadow-[0_30px_90px_rgba(110,74,47,0.13)] md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,249,244,0.50),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(111,122,96,0.12),transparent_24%)]" />
        <div
          data-gsap="process-orb"
          className="absolute -right-16 top-10 h-64 w-64 rounded-full bg-[rgba(111,122,96,0.14)] blur-3xl"
        />

        <div className="relative grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="relative min-h-[430px] lg:min-h-[620px]">
            <div className="absolute left-7 top-0 hidden h-full w-px bg-[linear-gradient(180deg,transparent,rgba(62,42,31,0.28),transparent)] md:block" />
            <div className="absolute left-3 top-12 z-10 hidden rotate-[-90deg] text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)] md:block">
              Guided protocol
            </div>

            <div data-gsap="process-image" className="relative ml-0 h-full md:ml-14">
              <GlassCard className="h-full overflow-hidden rounded-[36px] p-2">
                <div className="overflow-hidden rounded-[29px]">
                  <img
                    data-gsap="process-photo"
                    src={placeholder.process}
                    alt="Escena clínica editorial"
                    className="h-full min-h-[390px] w-full object-cover object-[50%_16%] lg:min-h-[600px]"
                  />
                </div>
              </GlassCard>
            </div>

            <div className="absolute bottom-7 left-4 max-w-[280px] rounded-[24px] border border-[rgba(198,162,123,0.28)] bg-[rgba(255,249,244,0.72)] p-5 shadow-[0_18px_48px_rgba(62,42,31,0.16)] backdrop-blur-2xl md:left-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                Proceso guiado
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                Cada decisión estética se construye con criterio médico, escucha
                real y una intención elegante.
              </p>
              <div className="mt-4 flex gap-2">
                {["01", "02", "03"].map((item) => (
                  <span
                    key={item}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(154,107,67,0.18)] bg-[rgba(247,242,236,0.78)] text-[11px] font-semibold text-[var(--color-mocha)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 lg:pr-8">
            <div
              data-gsap="process-badge"
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.52)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)] backdrop-blur-xl"
            >
              Cómo es el proceso
            </div>

            <h2
              data-gsap="process-title"
              className="font-display mt-6 max-w-3xl text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl"
            >
              Una experiencia guiada con calidez, precisión y elegancia serena.
            </h2>

            <p
              data-gsap="process-body"
              className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-copy)] md:text-lg"
            >
              La consulta se vive como un proceso editorial y clínico a la vez:
              sobrio, claro y cuidadosamente diseñado para que cada decisión tenga
              intención, armonía y seguimiento real.
            </p>

            <div className="mt-10 space-y-4">
              {processSteps.map((step) => (
                <div
                  key={step.step}
                  data-gsap="process-step"
                  className="group flex gap-5 rounded-[24px] border border-[rgba(198,162,123,0.18)] bg-[rgba(255,249,244,0.58)] p-5 shadow-[0_16px_42px_rgba(110,74,47,0.06)] backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:bg-[rgba(255,249,244,0.78)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(154,107,67,0.18)] bg-[rgba(216,194,174,0.22)] text-sm font-semibold text-[var(--color-ink)] transition duration-500 group-hover:bg-[rgba(111,122,96,0.12)]">
                    {step.step}
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-[var(--color-ink)] md:text-xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)] md:text-base">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div
              data-gsap="process-cta"
              className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              <SoftButton href="/agendar">Agendar valoración</SoftButton>
              <p className="text-sm leading-7 text-[var(--color-copy)]">
                Una primera cita bien guiada crea mejores decisiones y resultados
                más elegantes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
