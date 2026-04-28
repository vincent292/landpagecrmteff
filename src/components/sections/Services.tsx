import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { services } from "../../data/landing";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function Services() {
  return (
    <SectionReveal
      id="servicios"
      className="mx-auto max-w-7xl px-6 py-28 md:px-8 md:py-36"
    >
      <SectionHeading
        eyebrow="Servicios"
        title="Enfoques diseñados para realzar, equilibrar y acompañar."
        description="Una propuesta clínica premium que combina medicina estética y ortomolecular desde una mirada elegante, actual y personalizada."
        align="center"
      />

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {services.map((service, index) => {
          const Icon = service.icon;

          return (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: index * 0.1 }}
              whileHover={{ y: -6 }}
              className="group"
            >
              <GlassCard className="h-full p-7 md:p-8">
                <div className="flex h-full flex-col">
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[rgba(216,194,174,0.28)] shadow-[inset_6px_6px_14px_rgba(110,74,47,0.04),inset_-6px_-6px_14px_rgba(255,255,255,0.5)] transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-6 w-6 text-[var(--color-ink)]" />
                  </div>

                  <h3 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
                    {service.title}
                  </h3>

                  <p className="mt-5 flex-1 text-base leading-8 text-[var(--color-copy)]">
                    {service.description}
                  </p>

                  <div className="mt-8 flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    <span>Próximamente integrable a citas</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </SectionReveal>
  );
}
