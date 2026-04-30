alter table public.appointments
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

create index if not exists appointments_doctor_idx on public.appointments(doctor_id);

create or replace function public.is_admin_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and role in ('superadmin', 'admin')
  );
$$;

create or replace function public.current_doctor_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dp.id
  from public.doctor_profiles dp
  where dp.profile_id = auth.uid()
    and dp.is_active = true
  limit 1;
$$;

create or replace function public.can_access_doctor(doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_staff()
    or (doctor_id is not null and doctor_id = public.current_doctor_profile_id());
$$;

create or replace function public.can_access_patient(patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_staff()
    or exists (
      select 1
      from public.patients p
      where p.id = patient_id
        and (
          p.profile_id = auth.uid()
          or p.assigned_doctor_id = public.current_doctor_profile_id()
        )
    );
$$;

drop policy if exists "Staff or owner read patients" on public.patients;
drop policy if exists "Staff manage patients" on public.patients;

create policy "Admin doctor or owner read patients"
on public.patients
for select
using (public.can_access_patient(id));

create policy "Admin or assigned doctor manage patients"
on public.patients
for all
using (
  public.is_admin_staff()
  or assigned_doctor_id = public.current_doctor_profile_id()
)
with check (
  public.is_admin_staff()
  or assigned_doctor_id = public.current_doctor_profile_id()
);

drop policy if exists "Staff manage clinical histories" on public.clinical_histories;
create policy "Admin or assigned doctor manage clinical histories"
on public.clinical_histories
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage clinical evolutions" on public.clinical_evolutions;
create policy "Admin or assigned doctor manage clinical evolutions"
on public.clinical_evolutions
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage patient photos" on public.patient_photos;
create policy "Admin or assigned doctor manage patient photos"
on public.patient_photos
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage photo comparisons" on public.photo_comparisons;
create policy "Admin or assigned doctor manage photo comparisons"
on public.photo_comparisons
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage appointments" on public.appointments;
create policy "Admin or assigned doctor manage appointments"
on public.appointments
for all
using (
  public.can_access_patient(patient_id)
  and (doctor_id is null or public.can_access_doctor(doctor_id))
)
with check (
  public.can_access_patient(patient_id)
  and (doctor_id is null or public.can_access_doctor(doctor_id))
);

drop policy if exists "Staff manage prescriptions" on public.patient_prescriptions;
create policy "Admin or assigned doctor manage prescriptions"
on public.patient_prescriptions
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage post cares" on public.post_treatment_cares;
create policy "Admin or assigned doctor manage post cares"
on public.post_treatment_cares
for all
using (public.can_access_patient(patient_id))
with check (public.can_access_patient(patient_id));

drop policy if exists "Staff manage appointment reservations" on public.appointment_reservations;
create policy "Admin or assigned doctor manage appointment reservations"
on public.appointment_reservations
for all
using (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
  or public.can_access_patient(patient_id)
)
with check (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
  or public.can_access_patient(patient_id)
);

drop policy if exists "Staff manage availability rules" on public.doctor_availability_rules;
create policy "Admin or doctor manage own availability rules"
on public.doctor_availability_rules
for all
using (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
)
with check (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
);

drop policy if exists "Staff manage availability blocks" on public.availability_blocks;
create policy "Admin or doctor manage availability blocks"
on public.availability_blocks
for all
using (public.is_staff())
with check (public.is_staff());
