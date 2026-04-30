import { useEffect, useRef, type ReactNode } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type SectionRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
};

export function SectionReveal({
  children,
  className = "",
  delay = 0,
  id,
}: SectionRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = ref.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!section || reduceMotion) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(section);
      const revealItems = q("[data-reveal]");

      gsap.fromTo(
        section,
        { autoAlpha: 0, y: 34, filter: "blur(14px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.82,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: section,
            start: "top 82%",
            once: true,
          },
        }
      );

      if (revealItems.length > 0) {
        gsap.fromTo(
          revealItems,
          { autoAlpha: 0, y: 30, scale: 0.985, filter: "blur(12px)" },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.78,
            delay: delay + 0.1,
            stagger: 0.09,
            ease: "power3.out",
            scrollTrigger: {
              trigger: section,
              start: "top 78%",
              once: true,
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, [delay]);

  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}
