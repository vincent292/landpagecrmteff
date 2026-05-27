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
    title: "Armonizacion estetica integral",
    description: "Protocolos personalizados para trabajar rostro y cuerpo con criterio medico, plan claro y resultados naturales.",
    icon: Sparkles,
  },
  {
    title: "Medicina ortomolecular personalizada",
    description: "Estrategias orientadas al bienestar, la vitalidad y el equilibrio interno desde una mirada medica integral.",
    icon: Leaf,
  },
  {
    title: "Evaluacion clinica de precision",
    description: "Atencion individualizada con valoracion detallada, escucha activa y planificacion terapeutica segun tus objetivos.",
    icon: Stethoscope,
  },
];

export const processSteps: ProcessStep[] = [
  {
    step: "01",
    title: "Valoracion clinica inicial",
    description: "Comenzamos con una conversacion clara para comprender tu historia, tus objetivos y la manera en que quieres sentirte.",
  },
  {
    step: "02",
    title: "Diseno del protocolo",
    description: "Se define un plan terapeutico personalizado, alineado con tu anatomia, estilo de vida y expectativas reales.",
  },
  {
    step: "03",
    title: "Aplicacion y seguimiento",
    description: "El proceso se ejecuta con seguimiento cercano y ajustes medidos para sostener resultados naturales y seguros.",
  },
];

export const stats: StatItem[] = [
  { value: "100%", label: "Atencion personalizada" },
  { value: "1:1", label: "Acompanamiento cercano" },
  { value: "360", label: "Vision integral" },
];

export const philosophyPoints: PhilosophyPoint[] = [
  {
    icon: ShieldCheck,
    title: "Profesionalismo sereno",
    text: "Criterio medico, precision clinica y trato humano en cada etapa del proceso.",
  },
  {
    icon: HeartHandshake,
    title: "Atencion intima",
    text: "Escucha real, privacidad y acompanamiento pensado para cada paciente.",
  },
  {
    icon: Sparkles,
    title: "Belleza natural",
    text: "Resultados naturales que respetan tu identidad, rasgos y expresion.",
  },
  {
    icon: Leaf,
    title: "Bienestar integral",
    text: "La estetica se integra con vitalidad, equilibrio y cuidado profundo.",
  },
];

export const doctorHighlights: DoctorHighlight[] = [
  { icon: Clock3, text: "Experiencia cuidadosa" },
  { icon: ShieldCheck, text: "Rigor profesional" },
  { icon: Sparkles, text: "Estetica natural" },
  { icon: HeartHandshake, text: "Trato cercano" },
];

export const navLinks: NavLink[] = [
  { label: "Filosofia", href: "#filosofia" },
  { label: "Servicios", href: "#servicios" },
  { label: "Proceso", href: "#proceso" },
  { label: "Doctora", href: "#doctora" },
];
