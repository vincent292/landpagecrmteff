export type UserRole = "admin" | "assistant" | "patient" | "student";

export type RequestStatus = "new" | "contacted" | "scheduled" | "finished" | "discarded";

export type ActivityType =
  | "Curso"
  | "Procedimiento"
  | "Cirugía"
  | "Presentación"
  | "Jornada"
  | "Valoración";

export type Treatment = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  gallery: string[];
  benefits: string[];
  duration: string;
  beforeAfterCare: string[];
  expectedResults: string[];
  faqs: { question: string; answer: string }[];
  featured?: boolean;
};

export type Promotion = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  oldPrice?: string;
  promoPrice?: string;
  city: string;
  validUntil: string;
  spots: number;
  active: boolean;
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  city: string;
  date: string;
  time: string;
  modality: string;
  price: string;
  spots: number;
  shortDescription: string;
  description: string;
  imageUrl: string;
  syllabus: string[];
  requirements: string[];
  certification: string;
  location: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  city: string;
  date: string;
  time: string;
  location: string;
  type: ActivityType;
  description: string;
  imageUrl: string;
  spots: number;
};

export type GalleryAlbum = {
  id: string;
  slug: string;
  title: string;
  city: string;
  date: string;
  description: string;
  coverUrl: string;
  images: string[];
  featured?: boolean;
};

export type InformationRequestPayload = {
  full_name: string;
  whatsapp: string;
  city: string;
  interest: string;
  message?: string;
  contact_preference: string;
  privacy_accepted: boolean;
};
