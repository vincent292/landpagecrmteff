alter table public.clinical_histories
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists session_time time;

alter table public.clinical_evolutions
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

alter table public.patient_photos
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null;

create index if not exists clinical_histories_doctor_idx
on public.clinical_histories(doctor_id, session_date desc, created_at desc);

create index if not exists clinical_evolutions_doctor_idx
on public.clinical_evolutions(doctor_id, created_at desc);

create index if not exists patient_photos_doctor_idx
on public.patient_photos(doctor_id, created_at desc);

drop policy if exists "Admin or assigned doctor manage clinical histories" on public.clinical_histories;
drop policy if exists "Staff manage clinical histories" on public.clinical_histories;
drop policy if exists "Staff read clinical histories" on public.clinical_histories;
drop policy if exists "Admin or owning doctor insert clinical histories" on public.clinical_histories;
drop policy if exists "Admin or owning doctor update clinical histories" on public.clinical_histories;
drop policy if exists "Admin or owning doctor delete clinical histories" on public.clinical_histories;

create policy "Staff read clinical histories"
on public.clinical_histories
for select
using (public.is_staff());

create policy "Admin or owning doctor insert clinical histories"
on public.clinical_histories
for insert
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor update clinical histories"
on public.clinical_histories
for update
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
)
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor delete clinical histories"
on public.clinical_histories
for delete
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

drop policy if exists "Admin or assigned doctor manage clinical evolutions" on public.clinical_evolutions;
drop policy if exists "Staff manage clinical evolutions" on public.clinical_evolutions;
drop policy if exists "Staff read clinical evolutions" on public.clinical_evolutions;
drop policy if exists "Admin or owning doctor insert clinical evolutions" on public.clinical_evolutions;
drop policy if exists "Admin or owning doctor update clinical evolutions" on public.clinical_evolutions;
drop policy if exists "Admin or owning doctor delete clinical evolutions" on public.clinical_evolutions;

create policy "Staff read clinical evolutions"
on public.clinical_evolutions
for select
using (public.is_staff());

create policy "Admin or owning doctor insert clinical evolutions"
on public.clinical_evolutions
for insert
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor update clinical evolutions"
on public.clinical_evolutions
for update
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
)
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor delete clinical evolutions"
on public.clinical_evolutions
for delete
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

drop policy if exists "Admin or assigned doctor manage patient photos" on public.patient_photos;
drop policy if exists "Staff manage patient photos" on public.patient_photos;
drop policy if exists "Staff read patient photos" on public.patient_photos;
drop policy if exists "Admin or owning doctor insert patient photos" on public.patient_photos;
drop policy if exists "Admin or owning doctor update patient photos" on public.patient_photos;
drop policy if exists "Admin or owning doctor delete patient photos" on public.patient_photos;

create policy "Staff read patient photos"
on public.patient_photos
for select
using (public.is_staff());

create policy "Admin or owning doctor insert patient photos"
on public.patient_photos
for insert
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor update patient photos"
on public.patient_photos
for update
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
)
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor delete patient photos"
on public.patient_photos
for delete
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);
