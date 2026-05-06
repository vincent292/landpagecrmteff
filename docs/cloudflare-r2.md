# Cloudflare R2

## Objetivo

Preparar un almacenamiento público controlado para fotos, videos y material visual de:

- galería pública
- testimonios
- material visual institucional

Los archivos privados o sensibles, como PDFs protegidos de libros, deben seguir usando acceso firmado temporal y no URLs públicas directas.

## Bucket recomendado

Crear un bucket para material público, por ejemplo:

- `dra-estefany-public-media`

Sugerencia de carpetas:

- `gallery/`
- `testimonials/`
- `videos/`
- `branding/`

## Variables de entorno

Frontend:

- `VITE_R2_PUBLIC_BASE_URL`

Backend o función segura:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## Importante

No exponer `R2_ACCESS_KEY_ID` ni `R2_SECRET_ACCESS_KEY` en el frontend.

Las subidas a R2 deben hacerse desde:

- un backend propio
- una Edge Function
- un endpoint seguro autenticado

## Flujo sugerido

1. El panel admin solicita una subida.
2. El backend o función segura valida permisos.
3. El backend sube el archivo a R2 o entrega una URL firmada de subida.
4. La base de datos guarda la URL pública final o la key interna del archivo.
5. El frontend resuelve la URL pública con `VITE_R2_PUBLIC_BASE_URL`.

## Uso en este proyecto

Se dejó preparado:

- `src/services/mediaStorageService.ts`

Ese servicio resuelve URLs públicas y deja lista la base para usar R2 cuando se habilite el backend de subida segura.

## Recomendaciones por tipo de contenido

Galería:

- guardar portada
- guardar categoría
- guardar ciudad y fecha
- usar `video_url` cuando el álbum tenga video principal

Testimonios:

- usar `image_url` para foto
- usar `video_url` para testimonio en video
- guardar nombre, ciudad y tratamiento relacionado si aplica

Libros:

- no publicar PDF en R2 con acceso libre
- mantener descarga protegida con signed URL temporal
