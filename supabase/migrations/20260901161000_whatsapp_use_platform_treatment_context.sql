-- WhatsApp CRM should answer treatment questions from platform data first.
update public.crm_settings
set allow_external_grounding = false
where id = true;

notify pgrst, 'reload schema';
