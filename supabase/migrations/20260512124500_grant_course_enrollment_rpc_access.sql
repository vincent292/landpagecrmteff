grant execute on function public.set_course_enrollment_status(uuid, text, text) to authenticated;
grant execute on function public.cleanup_expired_course_enrollment_receipts() to authenticated;
