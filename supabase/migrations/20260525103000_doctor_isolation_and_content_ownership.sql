alter table public.gallery_albums
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.books
  add column if not exists doctor_id uuid references public.doctor_profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists gallery_albums_doctor_idx on public.gallery_albums(doctor_id);
create index if not exists books_doctor_idx on public.books(doctor_id);

drop trigger if exists assign_actor_gallery_albums on public.gallery_albums;
create trigger assign_actor_gallery_albums before insert on public.gallery_albums
for each row execute function public.assign_current_actor();

drop trigger if exists assign_actor_books on public.books;
create trigger assign_actor_books before insert on public.books
for each row execute function public.assign_current_actor();

drop policy if exists "Admin manage albums" on public.gallery_albums;
create policy "Admin or owning doctor manage albums"
on public.gallery_albums
for all
using (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
)
with check (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
);

drop policy if exists "Admin manage gallery images" on public.gallery_images;
create policy "Admin or owning doctor manage gallery images"
on public.gallery_images
for all
using (
  public.is_admin_staff()
  or exists (
    select 1
    from public.gallery_albums album
    where album.id = gallery_images.album_id
      and public.can_access_doctor(album.doctor_id)
  )
)
with check (
  public.is_admin_staff()
  or exists (
    select 1
    from public.gallery_albums album
    where album.id = gallery_images.album_id
      and public.can_access_doctor(album.doctor_id)
  )
);

drop policy if exists "Admin manage books" on public.books;
create policy "Admin or owning doctor manage books"
on public.books
for all
using (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
)
with check (
  public.is_admin_staff()
  or public.can_access_doctor(doctor_id)
);

drop policy if exists "Staff manage patients" on public.patients;
drop policy if exists "Admin or assigned doctor manage patients" on public.patients;

create policy "Admin manage patients"
on public.patients
for all
using (public.is_admin_staff())
with check (public.is_admin_staff());

create policy "Doctor create patients"
on public.patients
for insert
with check (public.current_doctor_profile_id() is not null);

drop policy if exists "Admin or assigned doctor manage appointments" on public.appointments;
drop policy if exists "Staff manage appointments" on public.appointments;
drop policy if exists "Staff read appointments" on public.appointments;
drop policy if exists "Admin or owning doctor insert appointments" on public.appointments;
drop policy if exists "Admin or owning doctor update appointments" on public.appointments;
drop policy if exists "Admin or owning doctor delete appointments" on public.appointments;

create policy "Staff read appointments"
on public.appointments
for select
using (public.is_staff());

create policy "Admin or owning doctor insert appointments"
on public.appointments
for insert
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor update appointments"
on public.appointments
for update
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
)
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor delete appointments"
on public.appointments
for delete
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

drop policy if exists "Admin or assigned doctor manage appointment reservations" on public.appointment_reservations;
drop policy if exists "Staff manage appointment reservations" on public.appointment_reservations;
drop policy if exists "Staff read appointment reservations" on public.appointment_reservations;
drop policy if exists "Admin or owning doctor insert appointment reservations" on public.appointment_reservations;
drop policy if exists "Admin or owning doctor update appointment reservations" on public.appointment_reservations;
drop policy if exists "Admin or owning doctor delete appointment reservations" on public.appointment_reservations;

create policy "Staff read appointment reservations"
on public.appointment_reservations
for select
using (public.is_staff());

create policy "Admin or owning doctor insert appointment reservations"
on public.appointment_reservations
for insert
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor update appointment reservations"
on public.appointment_reservations
for update
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
)
with check (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

create policy "Admin or owning doctor delete appointment reservations"
on public.appointment_reservations
for delete
using (
  public.is_admin_staff()
  or (doctor_id is not null and public.can_access_doctor(doctor_id))
);

drop policy if exists "Admin or assigned doctor manage prescriptions" on public.patient_prescriptions;
drop policy if exists "Staff manage prescriptions" on public.patient_prescriptions;
drop policy if exists "Staff read prescriptions" on public.patient_prescriptions;
drop policy if exists "Admin or author insert prescriptions" on public.patient_prescriptions;
drop policy if exists "Admin or author update prescriptions" on public.patient_prescriptions;
drop policy if exists "Admin or author delete prescriptions" on public.patient_prescriptions;

create policy "Staff read prescriptions"
on public.patient_prescriptions
for select
using (public.is_staff());

create policy "Admin or author insert prescriptions"
on public.patient_prescriptions
for insert
with check (
  public.is_admin_staff()
  or public.current_doctor_profile_id() is not null
);

create policy "Admin or author update prescriptions"
on public.patient_prescriptions
for update
using (
  public.is_admin_staff()
  or created_by = auth.uid()
)
with check (
  public.is_admin_staff()
  or created_by = auth.uid()
);

create policy "Admin or author delete prescriptions"
on public.patient_prescriptions
for delete
using (
  public.is_admin_staff()
  or created_by = auth.uid()
);

drop policy if exists "Admin or assigned doctor manage post cares" on public.post_treatment_cares;
drop policy if exists "Staff manage post cares" on public.post_treatment_cares;
drop policy if exists "Staff read post cares" on public.post_treatment_cares;
drop policy if exists "Admin or author insert post cares" on public.post_treatment_cares;
drop policy if exists "Admin or author update post cares" on public.post_treatment_cares;
drop policy if exists "Admin or author delete post cares" on public.post_treatment_cares;

create policy "Staff read post cares"
on public.post_treatment_cares
for select
using (public.is_staff());

create policy "Admin or author insert post cares"
on public.post_treatment_cares
for insert
with check (
  public.is_admin_staff()
  or public.current_doctor_profile_id() is not null
);

create policy "Admin or author update post cares"
on public.post_treatment_cares
for update
using (
  public.is_admin_staff()
  or created_by = auth.uid()
)
with check (
  public.is_admin_staff()
  or created_by = auth.uid()
);

create policy "Admin or author delete post cares"
on public.post_treatment_cares
for delete
using (
  public.is_admin_staff()
  or created_by = auth.uid()
);
