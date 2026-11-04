# SORTEO

Aplicación web instalable (PWA) para sorteos con resultados de la Quiniela de la Ciudad.

**Estado:** versión inicial (etapas 1 a 12). Sorteos sin cobros: cada persona elige su número; el ganador sale de las últimas cifras del 1.er premio de la Quiniela de la Ciudad.

Plan completo (Etapa 1): https://claude.ai/artifact/SMxVzs8ao7PiKCnkVQyDH3

## Pantallas

| Ruta | Pantalla |
| --- | --- |
| `#/bienvenida` | Bienvenida |
| `#/` | Sorteos activos |
| `#/sorteo/:id` | Detalle del sorteo y grilla de números |
| `#/resultados` | Resultados |
| `#/perfil` | Ingreso y perfil del participante |
| `#/invitar` | Invitar participantes |
| `#/admin` | Panel administrativo |

## Desarrollo

```bash
cd sorteo
npm install
npm run dev     # servidor local
npm run build   # compila en sorteo/dist
```

## Publicación en Cloudflare Pages (plan gratuito)

- Repositorio: `usuariomicroapp/panel-micro-apps`
- Directorio raíz: `sorteo`
- Comando de compilación: `npm run build`
- Directorio de salida: `dist`

Variables (para la copia de cada cliente; sin ellas usa las de la app de Sebastián):

| Variable | Tipo | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Texto | URL del proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY`, `SUPABASE_KEY` | Texto | Clave *publishable* (pública) |
| `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY` | Texto | Clave pública de avisos push |
| `VAPID_PRIVATE_KEY` | Secret | Clave privada de avisos push (solo en Cloudflare) |

Nunca usar la clave *secret* / *service_role* de Supabase: la app no la necesita.

## Base de datos

- Copia nueva: pegar `supabase/para-pegar/base-completa-cliente-nuevo.sql` en el SQL Editor.
- Migraciones en orden en `supabase/migrations/`; pruebas en `supabase/tests/` (Postgres 16 local con `supabase_shim.sql`).
- Funciones de Cloudflare: `functions/api/quiniela.js` (Quiniela en vivo), `functions/api/push.js` (avisos), `functions/manifest.webmanifest.js`.
- `.github/workflows/sorteo-despertador.yml` consulta la base una vez por día para que Supabase gratis no la pause.
