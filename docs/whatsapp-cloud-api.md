# CRM de WhatsApp Cloud API + Gemini

El CRM vive en `/panel/crm-whatsapp` y solo es visible para los roles `admin` y `superadmin`.

## Arquitectura

- `api/whatsapp/webhook.ts`: verificación y recepción del webhook de Meta.
- `api/whatsapp/send.ts`: envío autenticado de texto, imagen/QR y plantillas.
- `api/crm/knowledge-sync.ts`: sincronización controlada de información pública.
- `lib/whatsapp/*`: firma HMAC, Meta, persistencia y Gemini.
- `supabase/migrations/20260828120000_whatsapp_crm.sql`: tablas, índices, RLS y Realtime.
- `src/pages/admin/WhatsAppCrmPage.tsx`: inbox, contacto, cita, pago y comprobante.

Los mensajes entrantes se guardan de forma idempotente usando `meta_message_id`. Los estados enviados por Meta (`sent`, `delivered`, `read`, `failed`, `deleted`) actualizan el mismo registro. La respuesta de Gemini se ejecuta con `waitUntil` para devolver `200` al webhook sin esperar a la IA.

## Variables de entorno

Configurar localmente y en Vercel. Nunca usar el service role o secretos en una variable `VITE_*`.

```env
# Supabase solo servidor
SUPABASE_URL=https://PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Meta WhatsApp
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_APP_SECRET=
WHATSAPP_API_VERSION=v25.0

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash

# URLs públicas
PUBLIC_SITE_URL=https://www.draballesteros.com
CRM_SOCIAL_URLS=https://www.instagram.com/PERFIL,https://www.tiktok.com/@PERFIL
CRM_KNOWLEDGE_URLS=
```

`WHATSAPP_TOKEN` sigue siendo aceptado como alias local de `WHATSAPP_ACCESS_TOKEN`, pero en producción se recomienda el nombre explícito.

## Puesta en marcha

1. Aplicar la migración:

   ```powershell
   npx supabase db push
   ```

2. Configurar todas las variables anteriores en Vercel para Production y Preview.
3. Desplegar el proyecto.
4. En Meta Developers configurar:

   ```text
   Callback URL: https://www.draballesteros.com/api/whatsapp/webhook
   Verify token: el mismo valor de WHATSAPP_VERIFY_TOKEN
   Campo suscrito: messages
   ```

5. Enviar un mensaje de prueba al número de WhatsApp.
6. Abrir `/panel/crm-whatsapp` con administradora o superusuario.
7. Pulsar **Sincronizar información** para cargar tratamientos, promociones, cursos, doctoras, ajustes públicos y las URLs externas configuradas.

## Flujo de citas y pagos

El CRM reutiliza el sistema existente:

1. La persona solicita una cita y Gemini comparte `/reservar-cita` cuando corresponde.
2. La administradora vincula la conversación con una fila de `appointment_reservations`.
3. Si la reserva tiene `public_payment_token`, puede enviar `/pago-cita/:token` desde el CRM.
4. También puede enviar la imagen del QR general configurado en el panel.
5. La persona sube su comprobante desde la página pública de pago.
6. El CRM muestra **Ver comprobante** mediante una URL privada firmada.

## Reglas operativas y de seguridad

- Meta y Gemini se invocan solo en servidor; los secretos nunca llegan al navegador.
- El webhook exige firma `x-hub-signature-256` en producción.
- RLS restringe todas las tablas CRM a `admin` y `superadmin`.
- Los endpoints manuales vuelven a validar JWT y rol en el servidor.
- Gemini no diagnostica, prescribe ni promete resultados; deriva reclamos, emergencias y solicitudes de atención humana.
- Al pedir atención humana se pausa la IA para esa conversación.
- Fuera de la ventana de atención de 24 horas solo se permiten plantillas aprobadas por Meta.
- Las redes sociales pueden bloquear extracción automatizada. En ese caso se debe agregar un resumen aprobado como fuente manual o una URL pública accesible; el error queda informado en la sincronización.

## Pruebas mínimas antes de producción

- Verificación GET del webhook con token correcto e incorrecto.
- POST sin firma, con firma inválida y con firma válida.
- Reenvío del mismo payload para confirmar idempotencia.
- Mensaje entrante de texto, imagen y documento.
- Estado de entrega, lectura y fallo.
- Toma manual del chat y pausa de Gemini.
- Envío de texto dentro de 24 h y rechazo fuera de ventana.
- Envío de una plantilla aprobada fuera de ventana.
- Vinculación de cita, envío de QR/enlace y visualización del comprobante.
