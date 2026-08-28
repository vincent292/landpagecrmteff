# CRM de WhatsApp Cloud API + Gemini en Supabase Edge Functions

Proyecto Supabase de producción:

```text
huwdvusjdiumohegffci
```

El CRM vive en `/panel/crm-whatsapp` y solo admite roles `admin` y `superadmin`.

## Arquitectura

- `supabase/functions/whatsapp-webhook`: verificación y recepción del webhook de Meta.
- `supabase/functions/whatsapp-send`: envío autenticado de texto, imagen/QR y plantillas.
- `supabase/functions/crm-knowledge-sync`: sincronización de información pública.
- `supabase/functions/_shared/whatsapp-crm.ts`: Meta, Gemini, firma HMAC y persistencia.
- `supabase/migrations/20260828120000_whatsapp_crm.sql`: tablas, índices, RLS y Realtime.
- `src/pages/admin/WhatsAppCrmPage.tsx`: inbox, contacto, cita, pago y comprobante.

Los mensajes se deduplican mediante `meta_message_id`. Los estados de Meta (`sent`, `delivered`, `read`, `failed`, `deleted`) actualizan el mismo registro. Gemini se ejecuta como tarea de fondo mediante `EdgeRuntime.waitUntil`, permitiendo responder rápidamente a Meta.

## Secretos de Edge Functions

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son proporcionados automáticamente por Supabase. No deben copiarse al frontend.

Configurar estos secretos desde Supabase Dashboard → Edge Functions → Secrets, o con CLI:

```env
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_APP_SECRET=
WHATSAPP_API_VERSION=v25.0

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash

PUBLIC_SITE_URL=https://www.draballesteros.com
CRM_SOCIAL_URLS=https://www.instagram.com/PERFIL,https://www.tiktok.com/@PERFIL
CRM_KNOWLEDGE_URLS=
```

Para cargar un archivo local `.env` sin versionarlo:

```powershell
npx supabase secrets set --env-file .env --project-ref huwdvusjdiumohegffci
```

`WHATSAPP_TOKEN` continúa aceptándose como alias de `WHATSAPP_ACCESS_TOKEN`, y `VERIFY_TOKEN` como alias de `WHATSAPP_VERIFY_TOKEN`.

## Migración y despliegue

```powershell
npx supabase login
npx supabase link --project-ref huwdvusjdiumohegffci
npx supabase db push
npm run supabase:deploy-crm
```

La configuración del repositorio establece:

- `whatsapp-webhook`: `verify_jwt = false`, porque Meta no envía un JWT de Supabase. La función exige en su lugar la firma HMAC `x-hub-signature-256`.
- `whatsapp-send`: `verify_jwt = true` y comprobación adicional de rol.
- `crm-knowledge-sync`: `verify_jwt = true` y comprobación adicional de rol.

## Configuración en Meta

```text
URL de devolución:
https://huwdvusjdiumohegffci.supabase.co/functions/v1/whatsapp-webhook

Token de verificación:
el mismo valor guardado en WHATSAPP_VERIFY_TOKEN

Campo de suscripción:
messages
```

No activar el certificado de cliente. Después de verificar, suscribirse a `messages` y publicar la app de Meta para recibir tráfico real.

## Flujo de citas y pagos

1. La persona solicita una cita y Gemini comparte `/reservar-cita` cuando corresponde.
2. La administradora vincula la conversación con `appointment_reservations`.
3. Si existe `public_payment_token`, envía `/pago-cita/:token` desde el CRM.
4. También puede enviar la imagen del QR general.
5. La persona sube su comprobante desde la página pública.
6. El CRM presenta **Ver comprobante** mediante una URL privada firmada.

## Seguridad

- Meta y Gemini se invocan exclusivamente desde Edge Functions.
- El webhook rechaza firmas ausentes o inválidas.
- RLS restringe las tablas CRM a administradora y superusuario.
- Las funciones manuales validan JWT y rol antes de usar el service role.
- Gemini no diagnostica, prescribe ni promete resultados.
- Las solicitudes de atención humana, reclamos y emergencias pausan la IA.
- Fuera de la ventana de 24 horas solo se envían plantillas aprobadas.
- Las URLs de conocimiento bloquean protocolos no HTTPS, direcciones IP y hosts locales.
