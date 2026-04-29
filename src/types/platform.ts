export type UserRole =
  | "superadmin"
  | "doctor"
  | "admin"
  | "assistant"
  | "patient"
  | "student"
  | "user";

export type RequestStatus = "new" | "contacted" | "scheduled" | "finished" | "discarded";

export type ActivityType =
  | "Curso"
  | "Procedimiento"
  | "Cirugia"
  | "Presentacion"
  | "Jornada"
  | "Valoracion";

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

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  role: UserRole;
  created_at: string;
};

export type Patient = {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  birth_date: string | null;
  gender: string | null;
  emergency_contact: string | null;
  notes: string | null;
  created_at: string;
};

export type ClinicalHistory = {
  id: string;
  patient_id: string;
  created_by: string | null;
  reason_for_consultation: string | null;
  medical_history: string | null;
  allergies: string | null;
  current_medications: string | null;
  previous_procedures: string | null;
  diagnosis: string | null;
  observations: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicalEvolution = {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  created_by: string | null;
  title: string;
  description: string;
  treatment_performed: string | null;
  recommendations: string | null;
  created_at: string;
};

export type PatientPhoto = {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  uploaded_by: string | null;
  photo_type: string;
  treatment_name: string | null;
  image_path: string;
  image_url: string | null;
  notes: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export type PhotoComparison = {
  id: string;
  patient_id: string;
  before_photo_id: string;
  after_photo_id: string;
  treatment_name: string;
  notes: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export type AppointmentStatus = "Programada" | "Confirmada" | "Realizada" | "Cancelada";

export type Appointment = {
  id: string;
  patient_id: string;
  created_by: string | null;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  city: string;
  location: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
};

export type PatientPrescription = {
  id: string;
  patient_id: string;
  created_by: string | null;
  title: string;
  prescription_text: string;
  indications: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export type PostTreatmentCare = {
  id: string;
  patient_id: string;
  created_by: string | null;
  title: string;
  treatment_name: string | null;
  care_instructions: string;
  warning_signs: string | null;
  next_steps: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
};

export type Book = {
  id: string;
  title: string;
  slug: string;
  author: string;
  description: string | null;
  cover_image: string | null;
  file_path: string | null;
  price: number;
  qr_payment_image: string | null;
  download_token_mode: "single_use" | "multiple_use";
  default_token_max_uses: number;
  is_active: boolean;
  created_at: string;
};

export type BookOrderStatus = "Pendiente" | "En revision" | "Aprobado" | "Rechazado";

export type BookOrder = {
  id: string;
  book_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  payment_receipt_path: string | null;
  status: BookOrderStatus;
  admin_notes: string | null;
  created_at: string;
  verified_at: string | null;
};

export type BookDownloadToken = {
  id: string;
  book_id: string;
  order_id: string;
  user_id: string;
  token: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type BookDownloadLog = {
  id: string;
  token_id: string;
  book_id: string;
  user_id: string;
  downloaded_at: string;
};
