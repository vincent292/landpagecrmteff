# Google OAuth con Supabase Auth

Este proyecto usa Supabase Auth como intermediario. El Client Secret de Google no va en el frontend ni en variables `VITE_*`.

## Google Cloud

En Google Cloud / Google Auth Platform crea un OAuth Client ID de tipo `Web application`.

Authorized JavaScript origins:

```text
https://www.draballesteros.com
http://localhost:5173
http://127.0.0.1:5173
```

Authorized redirect URIs:

```text
https://huwdvusjdiumohegffci.supabase.co/auth/v1/callback
```

Para Supabase local, si lo usas:

```text
http://127.0.0.1:57321/auth/v1/callback
```

## Supabase Dashboard

En el proyecto `huwdvusjdiumohegffci`:

1. Ve a `Authentication > Providers > Google`.
2. Activa Google.
3. Pega el `Client ID` y el `Client Secret` de Google.
4. Guarda.

Luego ve a `Authentication > URL Configuration`.

Site URL:

```text
https://www.draballesteros.com
```

Redirect URLs:

```text
https://www.draballesteros.com/auth/callback
http://localhost:5173/auth/callback
http://127.0.0.1:5173/auth/callback
```

Si pruebas desde una URL preview de Vercel, agrega tambien esa URL terminando en `/auth/callback`.

## Local

Para Supabase local, configura estas variables en el entorno donde ejecutas `supabase start`:

```text
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=tu-client-secret
```

Despues cambia en `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
```

El frontend solo necesita las variables normales:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SITE_URL=https://www.draballesteros.com
```
