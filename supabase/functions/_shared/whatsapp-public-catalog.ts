import type { SupabaseClient } from "npm:@supabase/supabase-js@2.105.1";

const fields = "id,title,short_description,description,public_info,benefits,duration,care_instructions,expected_results,city,doctor_id,appointment_type,agenda_tag,requires_assessment,allows_direct_booking,assessment_mode,treatment_price,direct_booking_price,assessment_price,assessment_price_presencial,assessment_price_virtual,available_slots,approved_slots,doctor_profiles(full_name,specialty)";

export async function loadPublicTreatments(admin: SupabaseClient, city?: string | null) {
  const rows: Array<Record<string, unknown> & { id: string; title: string }> = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from("treatments").select(fields).eq("is_active", true).is("deleted_at", null).order("id").range(offset, offset + pageSize - 1);
    if (city) query = query.eq("city", city);
    const { data, error } = await query;
    if (error) throw error; // A failed read must never mean "we do not offer it".
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.filter((row) => !/\b(prueba|test|interna)\b/i.test(row.title)).sort((a, b) => a.title.localeCompare(b.title));
}
