import { motion } from "framer-motion";

import { philosophyPoints } from "../../data/landing";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function Philosophy() {
  return (
    <SectionReveal
      id="filosofia"
      className="mx-auto max-w-7xl px-6 py-28 md:px-8 md:py-36"
    >
      <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <SectionHeading
          eyebrow="Filosofía"
          title="Lujo silencioso, medicina precisa y belleza que se siente auténtica."
          description="Cada detalle está pensado para ofrecer una experiencia sobria, cálida y altamente profesional. La estética no se aborda desde el exceso, sino desde la armonía, la salud y la naturalidad refinada."
        />

        <GlassCard className="p-8 md:p-10">
          <div className="grid gap-6 md:grid-cols-2">
            {philosophyPoints.map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.6, delay: index * 0.08 }}
                  className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.44)] p-6 shadow-[inset_7px_7px_18px_rgba(110,74,47,0.03),inset_-7px_-7px_18px_rgba(255,255,255,0.56)] transition duration-300 hover:-translate-y-1"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(198,162,123,0.18),rgba(184,138,90,0.26))] text-[var(--color-ink)] shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--color-ink)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                    {item.text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </SectionReveal>
  );
}
