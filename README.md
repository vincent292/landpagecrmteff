# Dra. Estefany Landing

Landing médica en React, TypeScript, Vite y Tailwind CSS.

## Desarrollo frontend

```bash
npm install
npm run dev
```

La app local corre en:

```bash
http://127.0.0.1:5173
```

## Supabase local con Docker

Requisitos:

- Docker Desktop abierto y corriendo.
- Dependencias instaladas con `npm install`.

Levantar Supabase local:

```bash
npm run supabase:start
```

Ver credenciales y URLs locales:

```bash
npm run supabase:status
```

Crear el archivo `.env.local` a partir de `.env.example` y pegar la `Publishable` key mostrada por `supabase:status`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=tu-publishable-key-local
```

No uses la `Secret` key en el frontend.

Detener Supabase:

```bash
npm run supabase:stop
```

Resetear base de datos local:

```bash
npm run supabase:reset
```

Generar tipos TypeScript desde la base local:

```bash
npm run supabase:types
```

## Roles del panel

El sistema usa cuatro roles en `profiles.role`:

- `superadmin`: superusuario, puede gestionar usuarios y roles.
- `doctor`: doctora, puede entrar al panel y gestionar módulos clínicos/operativos.
- `admin`: administradora, puede entrar al panel y gestionar módulos operativos.
- `user`: usuario/paciente/estudiante, sin acceso al panel.

Para crear el primer superusuario, registra una cuenta desde `/register` y luego ejecuta en Supabase Studio el snippet:

```sql
supabase/snippets/make-superadmin.sql
```

## Build

```bash
npm run build
```
