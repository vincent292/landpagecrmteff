import { useEffect, useRef } from "react";

import { motion, useScroll, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BadgeCheck, Sparkles } from "lucide-react";

import { placeholder, stats } from "../../data/landing";
import { SoftButton } from "../ui/SoftButton";

gsap.registerPlugin(ScrollTrigger);

export function Hero() {
  const ref = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"]);

  useEffect(() => {
    const section = ref.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!section || reduceMotion) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(section);

      gsap.fromTo(
        q("[data-gsap='hero-portrait']"),
        { autoAlpha: 0, y: 48, scale: 0.96, rotate: -1.4, filter: "blur(18px)" },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          rotate: 0,
          filter: "blur(0px)",
          duration: 1.2,
          delay: 0.18,
          ease: "power3.out",
        }
      );

      gsap.fromTo(
        q("[data-gsap='hero-detail']"),
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.75,
          delay: 0.58,
          stagger: 0.09,
          ease: "power3.out",
        }
      );

      gsap.to(q("[data-gsap='hero-photo']"), {
        yPercent: -5,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="inicio"
      ref={ref}
      className="relative min-h-screen overflow-hidden bg-[var(--color-base)]"
    >
      <motion.div style={{ y: imageY }} className="absolute inset-0 scale-[1.08]">
        <img
          src={placeholder.hero}
          alt="Imagen principal de la doctora"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(247,242,236,0.16),rgba(255,249,244,0.56)_32%,rgba(239,229,218,0.84)_62%,var(--color-base)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,249,244,0.40),transparent_30%),radial-gradient(circle_at_78%_24%,rgba(198,162,123,0.20),transparent_22%),radial-gradient(circle_at_62%_82%,rgba(183,156,132,0.20),transparent_34%)]" />
      </motion.div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-6 pb-16 pt-32 md:px-8">
        <motion.div
          style={{ y: contentY }}
          className="grid w-full gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-end"
        >
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.42)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--color-accent-strong)] backdrop-blur-xl"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Medicina Estética Ortomolecular
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.05 }}
              className="font-display max-w-4xl text-6xl font-semibold leading-[0.88] text-[var(--color-ink)] md:text-8xl xl:text-[6.5rem]"
            >
              Dra. Estefany Ballesteros
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
              className="mt-7 max-w-2xl text-lg leading-8 text-[var(--color-copy)] md:text-xl"
            >
              Estética médica con visión integral: bienestar, armonía y belleza
              natural en una experiencia clínica refinada, serena y profundamente
              personalizada.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="mt-10 flex flex-col gap-4 sm:flex-row"
            >
              <SoftButton href="/agendar">Reservar valoración</SoftButton>
              <SoftButton href="#servicios" variant="secondary">
                Descubrir enfoque
              </SoftButton>
            </motion.div>
          </div>

          <div className="relative min-h-[520px] lg:min-h-[660px] lg:justify-self-end">
            <div className="absolute left-4 top-10 h-[78%] w-[76%] rounded-[42px] border border-[rgba(154,107,67,0.14)] bg-[rgba(255,249,244,0.24)] blur-[1px] lg:left-0" />
            <div className="absolute -right-4 top-24 h-48 w-48 rounded-full bg-[rgba(111,122,96,0.14)] blur-3xl" />
            <div className="absolute bottom-12 left-0 hidden h-px w-40 bg-[linear-gradient(90deg,transparent,rgba(62,42,31,0.38),transparent)] md:block" />

            <div
              data-gsap="hero-portrait"
              className="relative mx-auto max-w-[420px] rounded-[38px] border-[12px] border-[rgba(255,249,244,0.72)] bg-[rgba(255,249,244,0.46)] p-2 shadow-[0_34px_90px_rgba(62,42,31,0.20),inset_0_1px_0_rgba(255,255,255,0.70)] backdrop-blur-2xl"
            >
              <div className="absolute -left-6 top-8 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.74)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-mocha)] shadow-[0_16px_40px_rgba(110,74,47,0.12)] backdrop-blur-xl">
                01 / Clinical Beauty
              </div>

              <div className="overflow-hidden rounded-[26px] bg-[var(--color-surface)]">
                <img
                  data-gsap="hero-photo"
                  src={placeholder.doctor}
                  alt="Retrato de la doctora"
                  className="h-[480px] w-full object-cover object-[50%_18%] md:h-[560px]"
                />
              </div>

              <div
                data-gsap="hero-detail"
                className="absolute -right-5 bottom-28 max-w-[190px] rounded-[24px] border border-[rgba(198,162,123,0.30)] bg-[rgba(255,249,244,0.66)] p-4 shadow-[0_18px_45px_rgba(62,42,31,0.16)] backdrop-blur-2xl"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  <BadgeCheck className="h-4 w-4" />
                  Enfoque 360
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
                  Armonía facial, bienestar interno y criterio médico.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    data-gsap="hero-detail"
                    className="rounded-[18px] border border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.64)] p-3 text-center shadow-[inset_4px_4px_12px_rgba(110,74,47,0.04),inset_-4px_-4px_12px_rgba(255,255,255,0.54)]"
                  >
                    <div className="text-lg font-semibold text-[var(--color-ink)]">
                      {item.value}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-[var(--color-copy)]">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
