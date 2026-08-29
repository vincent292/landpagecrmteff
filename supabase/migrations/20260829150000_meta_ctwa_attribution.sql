-- Attribution for Meta Click-to-WhatsApp referrals.  An ad is discovered from
-- the first inbound referral; it is intentionally left pending until staff
-- chooses the treatment/promotion and (optionally) its welcome instructions.

create table if not exists public.meta_ctwa_ads (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_type text,
  source_url text,
  headline text,
  body text,
  media_type text,
  image_url text,
  video_url text,
  thumbnail_url text,
  ctwa_clid text,
  treatment_id uuid references public.treatments(id) on delete set null,
  promotion_id uuid references public.promotions(id) on delete set null,
  welcome_message text,
  status text not null default 'pending' check (status in ('pending', 'configured')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  conversation_count integer not null default 0 check (conversation_count >= 0),
  raw_referral jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (treatment_id is null or promotion_id is null)
);

alter table public.crm_contacts
  add column if not exists meta_ctwa_ad_id uuid references public.meta_ctwa_ads(id) on delete set null;

alter table public.crm_conversations
  add column if not exists meta_ctwa_ad_id uuid references public.meta_ctwa_ads(id) on delete set null;

create table if not exists public.meta_ctwa_attributions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.crm_conversations(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  meta_ctwa_ad_id uuid not null references public.meta_ctwa_ads(id) on delete restrict,
  ctwa_clid text,
  referral_payload jsonb not null default '{}'::jsonb,
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists meta_ctwa_ads_status_last_seen_idx on public.meta_ctwa_ads(status, last_seen_at desc);
create index if not exists meta_ctwa_ads_treatment_idx on public.meta_ctwa_ads(treatment_id) where treatment_id is not null;
create index if not exists meta_ctwa_attributions_ad_idx on public.meta_ctwa_attributions(meta_ctwa_ad_id, attributed_at desc);
create index if not exists crm_contacts_meta_ctwa_ad_idx on public.crm_contacts(meta_ctwa_ad_id) where meta_ctwa_ad_id is not null;
create index if not exists crm_conversations_meta_ctwa_ad_idx on public.crm_conversations(meta_ctwa_ad_id) where meta_ctwa_ad_id is not null;

create or replace function public.meta_ctwa_ads_set_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := case
    when new.treatment_id is not null
      or new.promotion_id is not null
      or nullif(btrim(coalesce(new.welcome_message, '')), '') is not null
      then 'configured'
    else 'pending'
  end;
  return new;
end;
$$;

drop trigger if exists meta_ctwa_ads_set_status on public.meta_ctwa_ads;
create trigger meta_ctwa_ads_set_status
before insert or update of treatment_id, promotion_id, welcome_message on public.meta_ctwa_ads
for each row execute function public.meta_ctwa_ads_set_status();

create or replace function public.meta_ctwa_attribution_increment_ad_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.meta_ctwa_ads
  set conversation_count = conversation_count + 1,
      last_seen_at = greatest(last_seen_at, new.attributed_at)
  where id = new.meta_ctwa_ad_id;
  return new;
end;
$$;

drop trigger if exists meta_ctwa_attribution_increment_ad_count on public.meta_ctwa_attributions;
create trigger meta_ctwa_attribution_increment_ad_count
after insert on public.meta_ctwa_attributions
for each row execute function public.meta_ctwa_attribution_increment_ad_count();

drop trigger if exists meta_ctwa_ads_touch_updated_at on public.meta_ctwa_ads;
create trigger meta_ctwa_ads_touch_updated_at before update on public.meta_ctwa_ads
for each row execute function public.crm_touch_updated_at();

alter table public.meta_ctwa_ads enable row level security;
alter table public.meta_ctwa_attributions enable row level security;

drop policy if exists "CRM managers manage Meta CTWA ads" on public.meta_ctwa_ads;
create policy "CRM managers manage Meta CTWA ads" on public.meta_ctwa_ads
for all using (public.is_crm_manager()) with check (public.is_crm_manager());

drop policy if exists "CRM managers read Meta CTWA attributions" on public.meta_ctwa_attributions;
create policy "CRM managers read Meta CTWA attributions" on public.meta_ctwa_attributions
for select using (public.is_crm_manager());

grant select, insert, update, delete on public.meta_ctwa_ads to authenticated;
grant select on public.meta_ctwa_attributions to authenticated;
revoke execute on function public.meta_ctwa_ads_set_status() from public, anon, authenticated;
revoke execute on function public.meta_ctwa_attribution_increment_ad_count() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.meta_ctwa_ads;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
