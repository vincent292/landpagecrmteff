alter table public.information_requests
  add column if not exists whatsapp_prefill_message text;

alter table public.books
  add column if not exists public_info text,
  add column if not exists whatsapp_prefill_message text;
