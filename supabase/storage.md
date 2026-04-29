# Buckets requeridos

Crear estos buckets en Supabase Storage:

- `patient-photos-private` - privado
- `medical-files-private` - privado
- `book-files-private` - privado
- `book-covers-public` - publico
- `payment-receipts-private` - privado
- `public-gallery` - publico

# Uso sugerido

- `patient-photos-private`: fotos antes/despues y evolucion clinica.
- `medical-files-private`: documentos clinicos privados si luego agregamos adjuntos medicos.
- `book-files-private`: PDF, ebook o material digital comprado.
- `book-covers-public`: portadas de libros y QR de pago visual.
- `payment-receipts-private`: comprobantes de pago subidos por usuarios.
- `public-gallery`: galeria publica del sitio si luego migramos imagenes del book/eventos.

# Reglas

- Nunca guardar fotos clinicas de pacientes en `/public`.
- Nunca exponer `book-files-private` con URLs publicas permanentes.
- Para archivos privados usar siempre `createSignedUrl`.
- Los comprobantes de pago deben verse solo por admin, assistant o el usuario dueño del pedido.
