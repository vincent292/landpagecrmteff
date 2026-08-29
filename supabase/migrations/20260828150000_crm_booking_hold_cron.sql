create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'expire-whatsapp-booking-holds'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'expire-whatsapp-booking-holds',
    '*/5 * * * *',
    'select public.crm_expire_booking_holds();'
  );
end $$;
