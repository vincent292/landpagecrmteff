do $$
begin
  alter table public.savings_cards add column if not exists is_deleted boolean not null default false;
  alter table public.savings_cards add column if not exists deleted_at timestamptz;
  alter table public.savings_cards add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
  alter table public.savings_cards add column if not exists deleted_by_role text;
  alter table public.savings_cards add column if not exists deleted_by_name text;
  alter table public.savings_cards add column if not exists deleted_by_email text;

  alter table public.payment_plans add column if not exists is_deleted boolean not null default false;
  alter table public.payment_plans add column if not exists deleted_at timestamptz;
  alter table public.payment_plans add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
  alter table public.payment_plans add column if not exists deleted_by_role text;
  alter table public.payment_plans add column if not exists deleted_by_name text;
  alter table public.payment_plans add column if not exists deleted_by_email text;
end $$;

create index if not exists savings_cards_is_deleted_idx on public.savings_cards(is_deleted, created_at desc);
create index if not exists payment_plans_is_deleted_idx on public.payment_plans(is_deleted, created_at desc);

drop policy if exists "Patients read activated savings cards" on public.savings_cards;
create policy "Patients read activated savings cards" on public.savings_cards
for select using (
  coalesce(savings_cards.is_deleted, false) = false
  and savings_cards.deleted_at is null
  and exists (
    select 1
    from public.patients
    where patients.id = savings_cards.patient_id
      and patients.profile_id = auth.uid()
      and savings_cards.activated_at is not null
      and coalesce(savings_cards.status, '') <> 'Cancelada'
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own savings card installments" on public.savings_card_installments;
create policy "Patients read own savings card installments" on public.savings_card_installments
for select using (
  exists (
    select 1
    from public.savings_cards cards
    join public.patients on patients.id = cards.patient_id
    where cards.id = savings_card_installments.card_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
      and coalesce(cards.status, '') <> 'Cancelada'
      and coalesce(cards.is_deleted, false) = false
      and cards.deleted_at is null
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own savings card receipts" on public.savings_card_receipts;
create policy "Patients read own savings card receipts" on public.savings_card_receipts
for select using (
  exists (
    select 1
    from public.savings_card_installments installments
    join public.savings_cards cards on cards.id = installments.card_id
    join public.patients on patients.id = cards.patient_id
    where installments.id = savings_card_receipts.installment_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
      and coalesce(cards.status, '') <> 'Cancelada'
      and coalesce(cards.is_deleted, false) = false
      and cards.deleted_at is null
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own savings card redemptions" on public.savings_card_redemptions;
create policy "Patients read own savings card redemptions" on public.savings_card_redemptions
for select using (
  exists (
    select 1
    from public.savings_cards cards
    join public.patients on patients.id = cards.patient_id
    where cards.id = savings_card_redemptions.card_id
      and patients.profile_id = auth.uid()
      and cards.activated_at is not null
      and coalesce(cards.is_deleted, false) = false
      and cards.deleted_at is null
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own payment plans" on public.payment_plans;
create policy "Patients read own payment plans" on public.payment_plans
for select using (
  coalesce(payment_plans.is_deleted, false) = false
  and payment_plans.deleted_at is null
  and exists (
    select 1
    from public.patients
    where patients.id = payment_plans.patient_id
      and patients.profile_id = auth.uid()
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own payment plan installments" on public.payment_plan_installments;
create policy "Patients read own payment plan installments" on public.payment_plan_installments
for select using (
  exists (
    select 1
    from public.payment_plans plans
    join public.patients on patients.id = plans.patient_id
    where plans.id = payment_plan_installments.plan_id
      and patients.profile_id = auth.uid()
      and coalesce(plans.is_deleted, false) = false
      and plans.deleted_at is null
      and coalesce(patients.is_deleted, false) = false
  )
);

drop policy if exists "Patients read own payment plan receipts" on public.payment_plan_receipts;
create policy "Patients read own payment plan receipts" on public.payment_plan_receipts
for select using (
  exists (
    select 1
    from public.payment_plan_installments installments
    join public.payment_plans plans on plans.id = installments.plan_id
    join public.patients on patients.id = plans.patient_id
    where installments.id = payment_plan_receipts.installment_id
      and patients.profile_id = auth.uid()
      and coalesce(plans.is_deleted, false) = false
      and plans.deleted_at is null
      and coalesce(patients.is_deleted, false) = false
  )
);

drop trigger if exists audit_soft_delete_savings_cards on public.savings_cards;
create trigger audit_soft_delete_savings_cards
after update on public.savings_cards
for each row execute procedure public.audit_soft_delete();

drop trigger if exists require_superadmin_delete_savings_cards on public.savings_cards;
create trigger require_superadmin_delete_savings_cards
before delete on public.savings_cards
for each row execute procedure public.require_superadmin_and_audit_hard_delete();

drop trigger if exists audit_soft_delete_payment_plans on public.payment_plans;
create trigger audit_soft_delete_payment_plans
after update on public.payment_plans
for each row execute procedure public.audit_soft_delete();

drop trigger if exists require_superadmin_delete_payment_plans on public.payment_plans;
create trigger require_superadmin_delete_payment_plans
before delete on public.payment_plans
for each row execute procedure public.require_superadmin_and_audit_hard_delete();
