import { supabase } from "../lib/supabaseClient";

export type ServiceFeedbackContextType = "general" | "treatment" | "promotion" | "appointment" | "other";

export type ServiceFeedbackRow = {
  id: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  city: string | null;
  treatment_name: string | null;
  context_type: ServiceFeedbackContextType;
  context_title: string | null;
  context_reference_id: string | null;
  rating: number;
  would_recommend: boolean | null;
  comments: string | null;
  source: string | null;
  created_at: string;
};

export type ServiceFeedbackInput = {
  patient_name?: string | null;
  patient_phone?: string | null;
  patient_email?: string | null;
  city?: string | null;
  treatment_name?: string | null;
  context_type?: ServiceFeedbackContextType;
  context_title?: string | null;
  context_reference_id?: string | null;
  rating: number;
  would_recommend?: boolean | null;
  comments?: string | null;
  source?: string | null;
};

export async function submitServiceFeedback(input: ServiceFeedbackInput) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(input.rating))));
  const { data, error } = await supabase
    .from("service_feedback")
    .insert({
      patient_name: clean(input.patient_name),
      patient_phone: clean(input.patient_phone),
      patient_email: clean(input.patient_email),
      city: clean(input.city),
      treatment_name: clean(input.treatment_name),
      context_type: input.context_type ?? "general",
      context_title: clean(input.context_title),
      context_reference_id: input.context_reference_id ?? null,
      rating,
      would_recommend: input.would_recommend ?? null,
      comments: clean(input.comments),
      source: input.source ?? "public_link",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ServiceFeedbackRow;
}

export async function getServiceFeedback() {
  const { data, error } = await supabase
    .from("service_feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ServiceFeedbackRow[];
}

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}
