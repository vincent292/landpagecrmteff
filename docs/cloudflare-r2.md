# Cloudflare R2

## Objetivo

Migrar las subidas de archivos del proyecto a `Cloudflare R2`, separando claramente:

- contenido publico
- contenido privado

La idea es usar:

- `Supabase Edge Functions` para subir archivos de forma segura
- `Cloudflare R2` como almacenamiento final
- `Supabase` como base de datos para guardar rutas, referencias y metadatos

## Buckets recomendados

### Bucket publico

Nombre sugerido:

- `dra-estefany-public-media`

Uso recomendado:

- galeria publica
- testimonios publicos
- fotos institucionales
- branding
- QR visibles del sitio
- videos publicos
- portadas publicas

Carpetas sugeridas:

- `gallery/`
- `testimonials/`
- `branding/`
- `videos/`
- `books/covers/`
- `payments/qr/`

### Bucket privado

Nombre sugerido:

- `dra-estefany-private-media`

Uso recomendado:

- comprobantes de pago
- fotos clinicas de pacientes
- comparativas antes/despues privadas
- libros o PDFs protegidos
- adjuntos internos
- documentos medicos o administrativos privados

Carpetas sugeridas:

- `receipts/appointments/`
- `receipts/promotions/`
- `receipts/courses/`
- `receipts/books/`
- `receipts/cash-movements/`
- `patients/photos/`
- `patients/comparisons/`
- `books/files/`
- `medical/private/`

## Que va publico y que va privado

### Publico

Estos archivos pueden tener URL publica:

- galeria publica del sitio
- imagenes de tratamientos
- imagenes de promociones
- imagenes de cursos
- testimonios publicos
- portadas de libros
- imagen QR general de pagos
- fotos institucionales de doctoras o marca
- videos publicos de galeria o testimonios

### Privado

Estos archivos no deben tener URL publica directa:

- comprobantes de pago
- fotos clinicas de pacientes
- comparativas antes/despues internas
- PDFs o ebooks protegidos
- adjuntos medicos
- cualquier archivo asociado a un paciente

## Recomendacion para este proyecto

Tomando en cuenta el codigo actual del sistema:

### Mover a publico

- `public-gallery`
- `public-media`
- `book-covers-public`
- `payment_qr_image`
- `appointment_qr_payment_image`
- `course_qr_payment_image`
- `cover_image` de tratamientos, promociones, cursos, libros y galeria
- `image_url` y `video_url` de contenido publico

### Mover a privado

- `payment-receipts-private`
- `patient-photos-private`
- `book-files-private`
- `medical-files-private`
- cualquier `image_path`, `file_path` o `payment_receipt_path`

## Variables de entorno

### Variables para frontend

Estas si pueden ir en `Vercel` y en `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_R2_PUBLIC_BASE_URL`

Ejemplo:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_R2_PUBLIC_BASE_URL=https://tu-bucket-publico.r2.dev
```

### Variables secretas para Supabase Edge Functions

Estas no deben ir en el frontend:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET_NAME`
- `R2_PRIVATE_BUCKET_NAME`

Ejemplo:

```env
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=tu_access_key
R2_SECRET_ACCESS_KEY=tu_secret_key
R2_PUBLIC_BUCKET_NAME=dra-estefany-public-media
R2_PRIVATE_BUCKET_NAME=dra-estefany-private-media
```

## Donde poner las variables

### En Vercel

Poner:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_R2_PUBLIC_BASE_URL`

No poner:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET_NAME`
- `R2_PRIVATE_BUCKET_NAME`

### En Supabase

Poner como `Edge Function Secrets`:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET_NAME`
- `R2_PRIVATE_BUCKET_NAME`

### En local

Frontend en `.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=tu_publishable_key_local
VITE_R2_PUBLIC_BASE_URL=https://tu-bucket-publico.r2.dev
```

Functions en `supabase/functions/.env`:

```env
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=tu_access_key
R2_SECRET_ACCESS_KEY=tu_secret_key
R2_PUBLIC_BUCKET_NAME=dra-estefany-public-media
R2_PRIVATE_BUCKET_NAME=dra-estefany-private-media
```

## Importante

No exponer `R2_ACCESS_KEY_ID` ni `R2_SECRET_ACCESS_KEY` en:

- frontend
- `Vercel` como variables `VITE_*`
- archivos del cliente

Las subidas a R2 deben hacerse desde:

- una `Supabase Edge Function`
- un backend seguro
- un endpoint autenticado

## Flujo sugerido

### Subida publica

1. El admin elige una imagen o video publico.
2. El frontend llama a una Edge Function publica autenticada.
3. La function sube el archivo a `R2_PUBLIC_BUCKET_NAME`.
4. La function devuelve la `key` y la URL final publica.
5. La base de datos guarda la URL o la `key`.

### Subida privada

1. El usuario o admin elige un archivo privado.
2. El frontend llama a una Edge Function privada autenticada.
3. La function sube el archivo a `R2_PRIVATE_BUCKET_NAME`.
4. La base de datos guarda solo la `key` o `path`.
5. Cuando alguien deba verlo, otra function genera acceso temporal o hace proxy.

## Uso en este proyecto

Ya existe base para esta migracion:

- `src/services/mediaStorageService.ts`
- `src/services/storageService.ts`

La parte publica ya puede resolver URLs externas.

Falta implementar:

- subida segura a R2
- acceso temporal a archivos privados
- reemplazo gradual de subidas actuales a Supabase Storage

## Pruebas locales recomendadas

### Primera prueba

1. Crear ambos buckets en R2:
   - `dra-estefany-public-media`
   - `dra-estefany-private-media`
2. Cargar variables en `.env.local` y `supabase/functions/.env`
3. Crear una Edge Function para subida publica
4. Crear una Edge Function para subida privada
5. Probar subiendo:
   - una imagen publica
   - un comprobante privado

### Validaciones esperadas

Para publico:

- el archivo sube bien
- devuelve URL publica
- se puede abrir desde navegador
- se guarda bien en la base

Para privado:

- el archivo sube bien
- no existe URL publica directa
- se guarda solo el `path` o `key`
- se puede obtener acceso temporal desde una function segura

## Siguiente paso sugerido

Empezar por estos dos flujos:

1. `PublicImageUpload` hacia bucket publico en R2
2. comprobantes de pago hacia bucket privado en R2

Con eso validamos ambos escenarios antes de migrar fotos clinicas, libros y otros adjuntos.
