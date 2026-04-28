import {
  Clock3,
  HeartHandshake,
  Leaf,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export type ServiceItem = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export type StatItem = {
  value: string;
  label: string;
};

export type ProcessStep = {
  step: string;
  title: string;
  description: string;
};

export type PhilosophyPoint = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export type DoctorHighlight = {
  icon: LucideIcon;
  text: string;
};

export type NavLink = {
  label: string;
  href: string;
};

export const placeholder = {
  hero: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1600&q=80",
  doctor: "/doctora/dra1.jpg",
  process: "/doctora/dra3.jpg",
  doctorAlt: "/doctora/dra5.jpg",
};

export const services: ServiceItem[] = [
  {
    title: "Armonización estética integral",
    description:
      "Protocolos personalizados para realzar la belleza natural del rostro y cuerpo con un enfoque elegante, equilibrado y profundamente sobrio.",
    icon: Sparkles,
  },
  {
    title: "Medicina ortomolecular personalizada",
    description:
      "Estrategias orientadas al bienestar, la vitalidad y la optimización del equilibrio interno desde una mirada médica refinada.",
    icon: Leaf,
  },
  {
    title: "Evaluación clínica de precisión",
    description:
      "Atención individualizada con valoración detallada, escucha activa y planificación terapéutica según tus objetivos.",
    icon: Stethoscope,
  },
];

export const processSteps: ProcessStep[] = [
  {
    step: "01",
    title: "Valoración clínica inicial",
    description:
      "Comenzamos con una conversación íntima y precisa para comprender tu historia, tus objetivos y la manera en que quieres sentirte.",
  },
  {
    step: "02",
    title: "Diseño del protocolo",
    description:
      "Se traza una ruta terapéutica sobria y personalizada, alineada con tu anatomía, estilo de vida y expectativas reales.",
  },
  {
    step: "03",
    title: "Aplicación y seguimiento",
    description:
      "El proceso se ejecuta con control evolutivo, acompañamiento cercano y ajustes medidos para sostener resultados elegantes.",
  },
];

export const stats: StatItem[] = [
  { value: "100%", label: "Atención personalizada" },
  { value: "1:1", label: "Acompañamiento cercano" },
  { value: "360°", label: "Visión integral" },
];

export const philosophyPoints: PhilosophyPoint[] = [
  {
    icon: ShieldCheck,
    title: "Profesionalismo sereno",
    text: "Criterio médico, precisión clínica y trato humano en cada etapa del proceso.",
  },
  {
    icon: HeartHandshake,
    title: "Atención íntima",
    text: "Escucha real, privacidad y acompañamiento pensado para cada paciente.",
  },
  {
    icon: Sparkles,
    title: "Belleza natural",
    text: "Resultados elegantes que respetan tu identidad, rasgos y expresión.",
  },
  {
    icon: Leaf,
    title: "Bienestar integral",
    text: "La estética se integra con vitalidad, equilibrio y cuidado profundo.",
  },
];

export const doctorHighlights: DoctorHighlight[] = [
  { icon: Clock3, text: "Experiencia cuidadosa" },
  { icon: ShieldCheck, text: "Rigor profesional" },
  { icon: Sparkles, text: "Estética natural" },
  { icon: HeartHandshake, text: "Trato cercano" },
];

export const navLinks: NavLink[] = [
  { label: "Filosofía", href: "#filosofia" },
  { label: "Servicios", href: "#servicios" },
  { label: "Proceso", href: "#proceso" },
  { label: "Doctora", href: "#doctora" },
];
