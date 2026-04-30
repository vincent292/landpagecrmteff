import { supabase } from "../lib/supabaseClient";

export type PrescriptionTemplateRow = {
  id: string;
  title: string;
  prescription_text: string;
  indications: string | null;
  category: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PostCareTemplateRow = {
  id: string;
  title: string;
  treatment_name: string | null;
  care_instructions: string;
  warning_signs: string | null;
  next_steps: string | null;
  category: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getPrescriptionTemplates() {
  const { data, error } = await supabase
    .from("prescription_templates")
    .select("*")
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PrescriptionTemplateRow[];
}

export async function createPrescriptionTemplate(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("prescription_templates").insert(data).select("*").single();
  if (error) throw error;
  return row as PrescriptionTemplateRow;
}

export async function getPostCareTemplates() {
  const { data, error } = await supabase
    .from("post_care_templates")
    .select("*")
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PostCareTemplateRow[];
}

export async function createPostCareTemplate(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("post_care_templates").insert(data).select("*").single();
  if (error) throw error;
  return row as PostCareTemplateRow;
}
