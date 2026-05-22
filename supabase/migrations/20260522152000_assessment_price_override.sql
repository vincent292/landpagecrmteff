alter table public.treatments
  add column if not exists assessment_price numeric(12,2);

alter table public.promotions
  add column if not exists assessment_price numeric(12,2);

notify pgrst, 'reload schema';
