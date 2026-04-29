import type { CalendarEvent, Course, GalleryAlbum, Promotion, Treatment } from "../types/platform";

const clinicalImage =
  "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1400&q=80";
const spaImage =
  "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1400&q=80";
const trainingImage =
  "https://images.unsplash.com/photo-1581093458791-9d42e72b4615?auto=format&fit=crop&w=1400&q=80";

export const treatmentsMock: Treatment[] = [
  {
    id: "treat-1",
    slug: "armonizacion-facial",
    title: "Armonización facial integral",
    shortDescription: "Diseño médico para equilibrar rasgos con resultados naturales.",
    description:
      "Protocolo personalizado que evalúa proporciones, expresión, piel y objetivos para realzar la belleza natural sin perder identidad.",
    imageUrl: "/doctora/dra2.jpg",
    gallery: ["/doctora/dra2.jpg", clinicalImage, spaImage],
    benefits: ["Equilibrio facial", "Resultado progresivo", "Plan médico personalizado"],
    duration: "45 a 70 minutos",
    beforeAfterCare: ["Evitar alcohol 24 horas antes", "No masajear la zona tratada", "Usar protector solar"],
    expectedResults: ["Rostro más armónico", "Expresión fresca", "Mejor definición de contornos"],
    faqs: [
      {
        question: "¿El resultado se ve natural?",
        answer: "Sí, el enfoque prioriza proporción, sobriedad y respeto por los rasgos propios.",
      },
    ],
    featured: true,
  },
  {
    id: "treat-2",
    slug: "hidratacion-profunda",
    title: "Hidratación profunda y glow",
    shortDescription: "Tratamiento para luminosidad, textura y vitalidad de la piel.",
    description:
      "Experiencia facial orientada a recuperar luminosidad, mejorar textura y reforzar la barrera cutánea.",
    imageUrl: spaImage,
    gallery: [spaImage, clinicalImage, "/doctora/dra1.jpg"],
    benefits: ["Piel más luminosa", "Mejor textura", "Sensación de frescura"],
    duration: "50 minutos",
    beforeAfterCare: ["Llegar sin maquillaje si es posible", "Evitar exfoliantes fuertes", "Hidratar la piel"],
    expectedResults: ["Glow inmediato", "Piel descansada", "Mejor elasticidad"],
    faqs: [
      {
        question: "¿Requiere reposo?",
        answer: "Generalmente no. La indicación final depende de la evaluación clínica.",
      },
    ],
  },
  {
    id: "treat-3",
    slug: "medicina-ortomolecular",
    title: "Medicina ortomolecular estética",
    shortDescription: "Bienestar, energía y estética desde una mirada integral.",
    description:
      "Evaluación orientada a vitalidad, balance interno y acompañamiento preventivo para complementar la estética médica.",
    imageUrl: clinicalImage,
    gallery: [clinicalImage, "/doctora/dra3.jpg", spaImage],
    benefits: ["Visión integral", "Bienestar sostenido", "Acompañamiento personalizado"],
    duration: "50 a 80 minutos",
    beforeAfterCare: ["Llevar estudios previos", "Compartir antecedentes", "Indicar suplementos actuales"],
    expectedResults: ["Mayor claridad del plan", "Mejor energía", "Objetivos medibles"],
    faqs: [
      {
        question: "¿Es una consulta médica?",
        answer: "Sí, parte de una valoración individual y de decisiones basadas en criterio profesional.",
      },
    ],
  },
];

export const promotionsMock: Promotion[] = [
  {
    id: "promo-1",
    title: "Glow facial de bienvenida",
    description: "Valoración facial + protocolo hidratante con beneficio especial.",
    imageUrl: spaImage,
    oldPrice: "Bs. 650",
    promoPrice: "Bs. 490",
    city: "Santa Cruz",
    validUntil: "2026-05-30",
    spots: 12,
    active: true,
  },
  {
    id: "promo-2",
    title: "Evaluación wellness premium",
    description: "Primera consulta ortomolecular con enfoque estético integral.",
    imageUrl: clinicalImage,
    promoPrice: "Bs. 220",
    city: "La Paz",
    validUntil: "2026-06-15",
    spots: 8,
    active: true,
  },
];

export const coursesMock: Course[] = [
  {
    id: "course-1",
    slug: "masterclass-armonizacion-natural",
    title: "Masterclass de armonización natural",
    city: "Santa Cruz",
    date: "2026-06-08",
    time: "09:00",
    modality: "Presencial",
    price: "Bs. 1.200",
    spots: 20,
    shortDescription: "Entrenamiento clínico para protocolos elegantes y seguros.",
    description:
      "Curso intensivo para profesionales que buscan elevar criterio estético, planificación y experiencia del paciente.",
    imageUrl: trainingImage,
    syllabus: ["Evaluación facial", "Diseño de protocolo", "Seguridad y seguimiento", "Casos clínicos"],
    requirements: ["Profesional o estudiante avanzado del área salud", "Registro previo"],
    certification: "Certificado de participación",
    location: "Centro médico premium, Santa Cruz",
  },
  {
    id: "course-2",
    slug: "workshop-wellness-estetico",
    title: "Workshop de wellness estético",
    city: "Cochabamba",
    date: "2026-07-12",
    time: "15:00",
    modality: "Híbrido",
    price: "Bs. 850",
    spots: 35,
    shortDescription: "Bienestar, piel y medicina preventiva en una jornada aplicada.",
    description:
      "Jornada formativa para conectar protocolos estéticos con hábitos, nutrición, vitalidad y seguimiento.",
    imageUrl: clinicalImage,
    syllabus: ["Balance interno", "Piel y estrés oxidativo", "Plan de acompañamiento"],
    requirements: ["Interés en medicina estética integral"],
    certification: "Certificado digital",
    location: "Hotel boutique, Cochabamba",
  },
];

export const calendarEventsMock: CalendarEvent[] = [
  {
    id: "event-1",
    title: "Jornada de valoración estética",
    city: "Santa Cruz",
    date: "2026-06-02",
    time: "10:00",
    location: "Consultorio principal",
    type: "Valoracion",
    description: "Espacios limitados para diagnóstico facial y planificación personalizada.",
    imageUrl: spaImage,
    spots: 14,
  },
  {
    id: "event-2",
    title: "Masterclass de armonización natural",
    city: "Santa Cruz",
    date: "2026-06-08",
    time: "09:00",
    location: "Centro médico premium",
    type: "Curso",
    description: "Entrenamiento presencial para profesionales de estética médica.",
    imageUrl: trainingImage,
    spots: 20,
  },
];

export const galleryMock: GalleryAlbum[] = [
  {
    id: "album-1",
    slug: "jornada-santa-cruz",
    title: "Jornada estética en Santa Cruz",
    city: "Santa Cruz",
    date: "2026-04-18",
    description: "Momentos de una jornada clínica con pacientes y formación profesional.",
    coverUrl: "/doctora/dra5.jpg",
    images: ["/doctora/dra5.jpg", "/doctora/dra4.jpg", trainingImage, clinicalImage],
    featured: true,
  },
  {
    id: "album-2",
    slug: "experiencia-wellness",
    title: "Experiencia wellness",
    city: "La Paz",
    date: "2026-03-22",
    description: "Encuentro dedicado a bienestar integral, piel y medicina preventiva.",
    coverUrl: spaImage,
    images: [spaImage, clinicalImage, "/doctora/dra2.jpg"],
  },
];
