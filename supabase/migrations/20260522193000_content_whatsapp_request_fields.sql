alter table public.promotions
  add column if not exists public_info text,
  add column if not exists whatsapp_prefill_message text;

alter table public.courses
  add column if not exists public_info text,
  add column if not exists whatsapp_prefill_message text;

alter table public.treatments
  add column if not exists public_info text,
  add column if not exists whatsapp_prefill_message text;
