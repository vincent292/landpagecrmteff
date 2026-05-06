import { supabase } from "../lib/supabaseClient";

export type TestimonialRow = {
  id: string;
  full_name: string | null;
  city: string | null;
  content: string | null;
  rating: number | null;
  image_url: string | null;
  treatment_name?: string | null;
  video_url?: string | null;
  is_active: boolean | null;
  created_at: string;
};

export async function getTestimonials() {
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TestimonialRow[];
}
