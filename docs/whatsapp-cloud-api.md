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
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite

PUBLIC_SITE_URL=https://www.draballesteros.com
CRM_SOCIAL_URLS=https://www.instagram.com/PERFIL,https://www.tiktok.com/@PERFIL
CRM_KNOWLEDGE_URLS=
```

Para cargar un archivo local `.env` sin versionarlo:

```powershell
npx supabase secrets set --env-file .env --project-ref huwdvusjdiumohegffci
```

`WHATSAPP_TOKEN` continúa aceptándose como alias de `WHATSAPP_ACCESS_TOKEN`, y `VERIFY_TOKEN` como alias de `WHATSAPP_VERIFY_TOKEN`.

Las respuestas de IA tienen un máximo de tres intentos en total, con 20 segundos
por petición. Ante errores temporales (408, 429, 500, 502, 503, 504 o fallos de red)
se espera brevemente y se usa el modelo de respaldo. Un `Retry-After` superior a
cinco segundos termina la operación para no reintentar antes de lo indicado por
Google. Las respuestas inválidas permiten una sola reparación, siempre con las
mismas fuentes y validaciones. No se reintentan errores de configuración o permisos.
Esto ocurre solo al responder un mensaje, sin nuevas tareas periódicas.

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

1. La persona solicita una cita y el flujo de WhatsApp pide la ciudad y el tratamiento cuando aún no se conocen. Si acaba de consultar un tratamiento, la reserva reutiliza esa selección.
2. El flujo recopila los datos del paciente y consulta la agenda. Para tratamientos con valoración previa se identifica su modalidad y costo por separado.
3. La reserva se registra en el sistema; un mensaje generado por Gemini nunca constituye una confirmación.
4. Cuando corresponde pagar, se envían las instrucciones y el QR. Si existe `public_payment_token`, el CRM también permite enviar `/pago-cita/:token`.
5. La persona envía su comprobante; el CRM permite revisarlo antes de confirmar el pago y la cita.
6. `/reservar-cita` queda disponible para quien solicite la web o como alternativa si no se puede continuar el flujo de WhatsApp.

## Calidad de respuestas

El bot tiene una restricción obligatoria al sitio oficial y los datos publicados de la plataforma. No se habilitan herramientas de búsqueda externa, aunque una configuración antigua tenga `allow_external_grounding=true`. El sincronizador solo descarga páginas del mismo origen que `PUBLIC_SITE_URL`, sin seguir redirecciones; las fuentes externas o manuales previamente importadas no se incluyen en las respuestas. Los anuncios aportan contexto, pero no son evidencia ni se envían sus mensajes de bienvenida sin validar.

Las respuestas libres usan un formato estructurado interno con tipo de respuesta y fragmentos exactos de evidencia. El backend valida que esa evidencia pertenezca a las fuentes entregadas; solo envía el mensaje para el paciente. Esta validación no sustituye la revisión de precisión de las paráfrasis.

- Tratamiento ausente del catálogo activo completo: «En este momento no tenemos ese tratamiento. ¿Te gustaría ver los tratamientos disponibles en nuestra página?». No se crea una reserva ni una derivación por esa ausencia.
- Tratamiento existente con un dato faltante: «Esa información no está publicada en nuestra página por el momento.».
- Tema externo: se explica que el bot atiende información de la página.
- Las solicitudes explícitas de una persona, urgencias y la gestión de reservas mantienen sus flujos.

El catálogo se lee con paginación para evitar falsos negativos por el límite de una página. Las copias antiguas de tratamientos y doctoras no sustituyen sus datos actuales.

La salida de Gemini se acepta únicamente cuando `finishReason` es `STOP`. Los bloques con `thought: true` se descartan; el texto final se revisa para detectar instrucciones internas y enlaces que no procedan de la configuración, las fuentes del sitio oficial incluidas en el contexto. Los enlaces Markdown se convierten a texto plano conservando la URL completa.

Una respuesta incompleta, vacía, demasiado larga o con instrucciones internas se regenera una vez. Si vuelve a fallar, el webhook envía una alternativa fija y registra `ai_fallback`. No se recortan respuestas generadas para hacerlas caber. El presupuesto de salida deja espacio para la respuesta final y el razonamiento se configura según la familia del modelo. Referencias: [pensamiento y partes de Gemini](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [motivos de finalización](https://ai.google.dev/api/generate-content#FinishReason).

Las preguntas sobre precio, duración, cuidados y otros campos de un tratamiento identificado se responden directamente con datos publicados. Una consulta que nombra otro tratamiento cambia el contexto antes de responder. Si una abreviatura como «rino» coincide con varias opciones, se pide elegir. La ficha inicial es breve; los cuidados extensos se envían completos en varios mensajes y el CRM guarda exactamente el texto enviado.

Los precios no se corrigen ni se deducen automáticamente. Si un tratamiento activo tiene un precio de prueba (por ejemplo, 1 Bs.) o información contradictoria, debe corregirse en el catálogo. El costo de una valoración se identifica como tal.

Pruebas sin llamadas a pacientes ni servicios reales:

```sh
npm run test:whatsapp
# Requiere Deno; también se puede ejecutar con npx --yes deno.
npm run test:whatsapp-flow
deno check --node-modules-dir=none --no-lock supabase/functions/whatsapp-webhook/index.ts
```

Las pruebas del flujo simulan Supabase, Meta y Gemini. El cambio se activa desplegando `whatsapp-webhook`; los módulos compartidos se empaquetan con esa función. No requiere migraciones de base de datos.

## Seguridad

- Meta y Gemini se invocan exclusivamente desde Edge Functions.
- El webhook rechaza firmas ausentes o inválidas.
- RLS restringe las tablas CRM a administradora y superusuario.
- Las funciones manuales validan JWT y rol antes de usar el service role.
- Gemini no diagnostica, prescribe ni promete resultados.
- Las solicitudes de atención humana, reclamos y emergencias pausan la IA.
- Fuera de la ventana de 24 horas solo se envían plantillas aprobadas.
- Las URLs de conocimiento bloquean protocolos no HTTPS, direcciones IP y hosts locales.
