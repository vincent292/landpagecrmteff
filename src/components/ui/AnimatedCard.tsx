import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "../../lib/cn";

gsap.registerPlugin(ScrollTrigger);

type AnimatedCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  index?: number;
};

export function AnimatedCard({ children, className = "", index = 0, ...props }: AnimatedCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = ref.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!card || reduceMotion) return;

    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        card,
        {
          autoAlpha: 0,
          y: isMobile ? 18 : 34,
          scale: isMobile ? 0.995 : 0.985,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: isMobile ? 0.48 : 0.72,
          delay: Math.min(index, 6) * (isMobile ? 0.035 : 0.07),
          ease: "power3.out",
          scrollTrigger: {
            trigger: card,
            start: "top 88%",
            once: true,
          },
        }
      );
    }, card);

    return () => ctx.revert();
  }, [index]);

  const animateTo = (vars: gsap.TweenVars) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ref.current || reduceMotion) return;

    gsap.to(ref.current, {
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto",
      ...vars,
    });
  };

  return (
    <div
      ref={ref}
      className={cn("min-w-0 max-w-full will-change-transform", className)}
      onPointerEnter={() => animateTo({ y: -4, scale: 1.012 })}
      onPointerLeave={() => animateTo({ y: 0, scale: 1 })}
      onPointerDown={() => animateTo({ y: -1, scale: 0.995 })}
      onPointerUp={() => animateTo({ y: -4, scale: 1.012 })}
      {...props}
    >
      {children}
    </div>
  );
}
