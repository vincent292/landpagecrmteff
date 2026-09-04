-- Some WhatsApp sessions were paused only because no dates were available.
-- Keep those conversations with AI enabled so patients can ask for another
-- city, doctor, treatment, or request a human explicitly.
with reopened as (
  update public.crm_booking_sessions
  set
    status = 'choosing_date',
    last_options = '[]'::jsonb,
    state_data = coalesce(state_data, '{}'::jsonb) || jsonb_build_object(
      'no_available_dates_reopened_at', now()
    ),
    updated_at = now()
  where status = 'needs_human'
    and appointment_reservation_id is null
    and coalesce(state_data ->> 'handoff_reason', '') = ''
    and coalesce(state_data ->> 'account_error', '') = ''
    and coalesce(state_data ->> 'payment_qr_error', '') = ''
    and coalesce(state_data ->> 'reschedule_requested', '') = ''
  returning conversation_id
)
update public.crm_conversations conversation
set
  needs_human = false,
  ai_enabled = true,
  intent = 'sin_fechas_disponibles',
  updated_at = now()
from reopened
where conversation.id = reopened.conversation_id;
