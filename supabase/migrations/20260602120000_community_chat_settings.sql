alter table public.site_settings
  add column if not exists community_chat_enabled boolean not null default false,
  add column if not exists community_chat_title text not null default 'Comunidades WhatsApp',
  add column if not exists community_chat_welcome text not null default 'Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto.',
  add column if not exists community_chat_placeholder text not null default 'Escribe "promociones", "cursos" o toca una opcion',
  add column if not exists community_chat_fallback_text text not null default 'Por ahora solo puedo ayudarte con las opciones visibles. Si deseas atencion personalizada o pedir una cita, usa el siguiente enlace.',
  add column if not exists community_chat_fallback_button_text text not null default 'Pedir cita',
  add column if not exists community_chat_fallback_url text not null default '/reservar-cita',
  add column if not exists community_chat_options jsonb not null default '[]'::jsonb;

update public.site_settings
set
  community_chat_enabled = coalesce(community_chat_enabled, false),
  community_chat_title = coalesce(nullif(trim(community_chat_title), ''), 'Comunidades WhatsApp'),
  community_chat_welcome = coalesce(
    nullif(trim(community_chat_welcome), ''),
    'Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto.'
  ),
  community_chat_placeholder = coalesce(
    nullif(trim(community_chat_placeholder), ''),
    'Escribe "promociones", "cursos" o toca una opcion'
  ),
  community_chat_fallback_text = coalesce(
    nullif(trim(community_chat_fallback_text), ''),
    'Por ahora solo puedo ayudarte con las opciones visibles. Si deseas atencion personalizada o pedir una cita, usa el siguiente enlace.'
  ),
  community_chat_fallback_button_text = coalesce(
    nullif(trim(community_chat_fallback_button_text), ''),
    'Pedir cita'
  ),
  community_chat_fallback_url = coalesce(
    nullif(trim(community_chat_fallback_url), ''),
    '/reservar-cita'
  ),
  community_chat_options = case
    when jsonb_typeof(community_chat_options) = 'array' then community_chat_options
    else '[]'::jsonb
  end;

notify pgrst, 'reload schema';
