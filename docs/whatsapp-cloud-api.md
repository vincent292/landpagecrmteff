# WhatsApp Cloud API

Este proyecto no usa Next.js App Router ni Pages Router. Es una app React/Vite desplegada en Vercel, por eso el webhook vive como Vercel Function en:

```text
api/whatsapp/webhook.ts
```

La URL publica del webhook queda:

```text
https://DOMINIO-DEL-PROYECTO/api/whatsapp/webhook
```

Para el dominio actual del proyecto, usa:

```text
https://www.draballesteros.com/api/whatsapp/webhook
```

## Variables de entorno

Agrega estas variables en `.env.local` para pruebas locales con Vercel y tambien en Vercel para produccion:

```env
WHATSAPP_VERIFY_TOKEN=wp_ai_lab_verify_2026
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_APP_SECRET=
WHATSAPP_API_VERSION=v25.0
```

No coloques estos secretos directamente en el codigo.

`WHATSAPP_VERIFY_TOKEN` no es el access token de Meta. Es una cadena privada creada por nosotros para que Meta pueda verificar que el endpoint nos pertenece. Puedes usar, por ejemplo:

```text
wp_ai_lab_verify_2026
```

## Variables en Vercel

En Vercel entra a Project Settings > Environment Variables y crea:

```text
WHATSAPP_VERIFY_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
META_APP_SECRET
WHATSAPP_API_VERSION
```

Usa `v25.0` como valor de `WHATSAPP_API_VERSION`.

## Diferencia entre variables

- `WHATSAPP_VERIFY_TOKEN`: texto privado creado por nosotros para validar el webhook en Meta.
- `WHATSAPP_ACCESS_TOKEN`: token de acceso de Meta usado para enviar mensajes por la Graph API.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del numero de WhatsApp dentro de Meta.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: identificador de la cuenta de WhatsApp Business.
- `META_APP_SECRET`: secreto de la app de Meta; se usa para validar la firma `x-hub-signature-256`.

## Configuracion en Meta

En el panel de Meta Developers, configura el webhook con estos valores:

```text
URL de devolucion de llamada:
https://www.draballesteros.com/api/whatsapp/webhook

Token de verificacion:
wp_ai_lab_verify_2026
```

El token de verificacion debe ser exactamente el mismo valor guardado en `WHATSAPP_VERIFY_TOKEN`.

Luego:

1. Presiona "Verificar y guardar".
2. Suscribete al campo `messages`.
3. Guarda los cambios.

## Como probar

1. Despliega el proyecto en Vercel con las variables configuradas.
2. Envia un mensaje de texto al numero registrado en WhatsApp Cloud API.
3. Revisa los logs de Vercel.
4. Confirma que aparece un log de mensaje entrante.
5. Confirma que WhatsApp responde:

```text
¡Hola! 👋 El asistente de WhatsApp está funcionando correctamente.
```

## Firma de Meta

El codigo incluye validacion preparada para `x-hub-signature-256` usando `META_APP_SECRET` y HMAC SHA-256.

En esta fase:

- El `GET` de verificacion no bloquea por firma.
- El `POST` rechaza la peticion si Meta envia una firma invalida.
- Si no llega la firma, el webhook continua y deja un log informativo para facilitar la primera configuracion.

## Alcance de esta fase

Esta fase solo verifica el webhook, recibe eventos, registra mensajes entrantes en logs y responde con un texto fijo.

No integra Gemini, OpenAI, DeepSeek, Google Calendar, logica de citas, n8n ni nuevas tablas de Supabase.
