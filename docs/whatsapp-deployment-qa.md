# Verificación del despliegue de WhatsApp

## Actualización: escritura apresurada y fallos de Gemini, 9 de septiembre de 2026

Los logs de producción de las 17:06 y 17:11 (Bolivia) mostraron, respectivamente,
un HTTP 503 de Gemini por alta demanda y un timeout de 12 segundos. El mensaje de
error no demostraba que la página estuviera inaccesible. Además, la comparación
de tratamientos admitía palabras de dos letras: `de` podía hacer coincidir
rinomodelación con laminado de cejas.

Correcciones: comparación de nombres sin esas coincidencias cortas, tolerancia a
tres errores en nombres largos, prioridad del tema más reciente al recuperar
fuentes y reintentos limitados con un modelo de respaldo. Se conserva el modelo
principal configurado; el respaldo predeterminado es `gemini-3.5-flash-lite`.
No se añadieron tareas periódicas ni se modificó el catálogo.

Despliegue confirmado: `whatsapp-webhook` v56, `whatsapp-send` v12,
`crm-knowledge-sync` v12 y `crm-notification-dispatch` v15, todas ACTIVE.
El webhook devolvió 200 al desafío de Meta y al evento firmado vacío (cero
respuestas en cola), y 403 al evento sin firma. No se ejecutaron migraciones.

Validación: 39 pruebas de respuestas y 28 de integración simulada, con chequeo de
tipos Deno y ESLint de los archivos afectados. Las pruebas cubren 503, 429,
timeouts, fallos de red, errores permanentes, límites de reintentos y evidencia.

Pruebas del generador local con Gemini real y el catálogo público de producción:

- `buenas quiero savbe4r sobre rinomodelasion`: respuesta de tratamiento ausente,
  en 12,6 segundos.
- `quiero saber sobre rsdsinomodelacion`: misma respuesta, en 33,9 segundos;
  se recuperó del timeout del modelo principal usando el respaldo.
- `buenass quiero savber sobre limpiesa fasial`: información de limpieza facial
  basada en la ficha publicada, en 39,5 segundos, tras dos fallos temporales.

Rinomodelación no figura en el catálogo consultado, ni en la búsqueda interna por
`rino`; no se inventó una ficha para responder. El precio de limpieza publicado
continúa siendo 1 Bs. Estas pruebas no enviaron mensajes a teléfonos. La latencia
del proveedor sigue siendo variable; los reintentos no garantizan disponibilidad.

Las versiones y verificaciones de secciones anteriores son registros históricos.

## Actualización: restricciones al sitio oficial — 9 de septiembre de 2026

Estado publicado en `huwdvusjdiumohegffci`:

- `whatsapp-webhook`: versión **53**, **ACTIVE**.
- `crm-knowledge-sync`: versión **9**, **ACTIVE**.
- No se ejecutaron migraciones.

El bot consulta el catálogo completo, responde la ausencia de un tratamiento sin derivar a una asesora, distingue datos no publicados y limita las respuestas a las fuentes oficiales. Google Search queda deshabilitado incluso para configuraciones antiguas que lo habilitaban. Se excluyen fuentes externas, manuales y copias antiguas del catálogo; el sincronizador descarga exclusivamente el sitio oficial. Los mensajes de bienvenida de anuncios no pueden enviar información sin validar.

Validaciones finales:

- **50 pruebas correctas**: 34 de respuestas y política de fuentes, 16 de integración simulada.
- ESLint, tipos de las funciones con Deno y `npm run build`: correctos.
- Webhook publicado: verificación de Meta HTTP 200, rechazo de petición sin firma HTTP 403 y aceptación de evento firmado sin mensajes HTTP 200.
- Las pruebas incluyen un tratamiento después de la primera página del catálogo, tratamientos de otra ciudad, preguntas fuera del ámbito y evidencia inventada.

Pruebas adicionales con Gemini real desde el generador local:

- Precio de laminado: respondió el precio publicado de 1 Bs. en 2,8 segundos.
- Noticias deportivas en Google: devolvió la respuesta restringida a información de la página en 1,4 segundos, sin herramientas de búsqueda.
- Sesiones anuales no publicadas: respondió «Esa información no está publicada en nuestra página por el momento.» en 1,3 segundos.
- La primera prueba de un procedimiento inexistente que compartía la palabra «facial» con otro tratamiento mostró una aclaración innecesaria. Se corrigió la coincidencia parcial y se agregaron pruebas de regresión. Al repetir la llamada real, Gemini devolvió HTTP 503 por alta demanda; ese último intento no confirmó la respuesta completa con el proveedor. Las pruebas deterministas e integradas del caso corregido sí pasaron.

Pendientes para continuar desde otra computadora:

1. Actualizar `main` desde Git. El cambio del indicador de fuentes del panel está incluido en el código; la restricción ya se aplica en Supabase independientemente de la publicación del frontend.
2. Facilitar el número de WhatsApp autorizado para la prueba de extremo a extremo. Todavía no se han enviado mensajes a teléfonos ni creado reservas de prueba.
3. Revisar precios de 1 Bs., coherencia de duraciones y la invitación prematura a reservar que aún apareció en una respuesta libre.
4. Vigilar los tiempos de respuesta y los errores temporales de Gemini. El fallo del proveedor no se interpreta como ausencia de un tratamiento.

Los resultados siguientes corresponden al despliegue anterior y se conservan como referencia.

## Despliegue anterior

- Proyecto: `huwdvusjdiumohegffci`.
- Función: `whatsapp-webhook`.
- Versión publicada: **52**, estado **ACTIVE**.
- Código base: commit `3f570d0`.
- Se incluyeron los módulos compartidos de respuestas, catálogo y reservas.
- No se ejecutaron migraciones de base de datos.

## Pruebas técnicas

- 31 pruebas de respuestas: correctas.
- 8 pruebas de flujo con Supabase, Meta y Gemini simulados: correctas.
- ESLint de los módulos del bot: correcto.
- Revisión de tipos de la función con Deno: correcta.

Comprobaciones contra la función publicada:

| Comprobación | Resultado |
|---|---|
| Verificación de Meta con token configurado | HTTP 200; devolvió el desafío solicitado |
| Rechazo de una petición sin firma | HTTP 403, tal como establece la función |
| Petición firmada sin mensajes | HTTP 200; cero mensajes recibidos y cero respuestas en cola |

Estas comprobaciones verifican que la función arranca y valida las peticiones. No prueban la entrega a un teléfono.

## Respuestas de Gemini con datos públicos reales

Se consultó el catálogo público de producción y se llamó al generador local con Gemini real, usando el modelo configurado localmente: `gemini-3.6-flash`. Estas llamadas no pasaron por el webhook publicado ni enviaron mensajes de WhatsApp. No se ha comprobado que la configuración remota del modelo sea idéntica.

Tratamiento utilizado: **LAMINADO DE CEJAS**, Cochabamba. El catálogo devuelve precio **1 Bs.**, duración estructurada **60 minutos** e información pública que indica **45 a 60 minutos**, con duración del resultado de **4 a 6 semanas**.

### Precio — 6 segundos

Pregunta:

> Quisiera saber el precio de LAMINADO DE CEJAS en Cochabamba

Respuesta:

> Hola. El laminado de cejas en la sede de Cochabamba tiene un precio de 1 Bs. Es un procedimiento personalizado que toma de 45 a 60 minutos y deja tus cejas definidas y ordenadas, con resultados que duran entre 4 y 6 semanas.
>
> ¿Te gustaría agendar un espacio para tu tratamiento?

### Información — primer intento agotó 12 segundos; repetición manual respondió en 3 segundos

Pregunta:

> Me cuentas brevemente en qué consiste LAMINADO DE CEJAS?

Respuesta de la repetición:

> El laminado de cejas es un tratamiento que las peina, fija y define para darles un aspecto más poblado, ordenado y natural. Es un procedimiento personalizado que dura entre 45 a 60 minutos y los resultados se mantienen por 4 a 6 semanas.
>
> ¿Te gustaría información sobre costos o deseas agendar una cita en nuestra sede de Cochabamba?

### Duración, con el tratamiento incluido en el contexto — 1,3 segundos

Pregunta:

> ¿Cuánto dura?

Respuesta:

> El efecto del laminado de cejas dura entre 4 y 6 semanas aproximadamente. La sesión en el consultorio toma de 45 a 60 minutos, donde las personalizamos según la forma natural de tu rostro.
>
> ¿Te gustaría consultar la disponibilidad de citas en Cochabamba?

## Hallazgos para revisión humana

1. Las respuestas recibidas llegaron completas y sin bloques de instrucciones internas. Esto no garantiza por sí solo la precisión de todo su contenido.
2. Una consulta a Gemini agotó el límite de tiempo. La repetición manual funcionó; la latencia necesita seguimiento.
3. Gemini sigue invitando a reservar en preguntas informativas. Conviene revisar ese comportamiento antes de ampliar el diseño conversacional.
4. El precio de 1 Bs. está publicado en el catálogo; debe confirmarse o corregirse allí.
5. Hay que validar las explicaciones generadas frente al contenido que la profesional apruebe.

## Pendiente

La prueba de extremo a extremo con entrega a WhatsApp requiere el número de prueba autorizado por el usuario. No se enviaron mensajes a contactos ni se crearon reservas durante esta verificación.
