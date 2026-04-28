import { DoctorSection } from "../../components/sections/DoctorSection";

export function AboutDoctorPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-6 pt-16 md:px-8 md:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Sobre la doctora</p>
        <h1 className="font-display mt-4 max-w-4xl text-6xl font-semibold leading-[0.9]">Trayectoria, criterio médico y una estética profundamente humana.</h1>
      </section>
      <DoctorSection />
    </>
  );
}
