# Mis Cuentas · versión con cuentas en la nube (para vender)

App independiente de `finanzas/` (que no se modifica). Cada cliente crea su usuario, sus datos se guardan en Supabase y el acceso se controla desde un panel de administrador: prueba gratis, activar, extender o pausar.

## Cómo protege el negocio (lo garantiza la base, no el navegador)
- Cada persona solo lee y escribe sus propios datos (RLS).
- Sin acceso vigente (prueba vencida, suscripción vencida o pausado) **no se pueden leer ni guardar datos**.
- Nadie puede cambiarse el vencimiento, el estado ni el rol. Solo el administrador, mediante `admin_set_access`.
- Compartir el link no sirve: cada cuenta necesita su propio acceso vigente.

## Puesta en marcha
1. **Supabase:** crear un proyecto NUEVO (no el de SORTEO). SQL Editor → pegar y ejecutar `supabase/base.sql`.
2. **Auth:** Authentication → Providers → Email: dejar activo. Para que el alta sea inmediata (recomendado para publicidad) desactivar *Confirm email*. Authentication → URL Configuration: poner el link de la app en *Site URL* (sirve para recuperar contraseña).
3. **Claves:** Project Settings → API: copiar `Project URL` y la clave *publishable/anon* en `config.js`. **Nunca** la `service_role`.
4. **Cloudflare Pages:** proyecto nuevo, repo `panel-micro-apps`, rama `main`, directorio raíz `finanzas-nube`, sin comando de compilación, salida `.`.
5. Abrir el link y **crear tu cuenta**. Luego, en el SQL Editor:
   `update public.profiles set role = 'admin' where email = 'TU_CORREO';`
6. Entrar de nuevo → Ajustes → *Panel de administrador*: configurar nombre, color, días de prueba, precio, link de pago (Mercado Pago) y tu WhatsApp.

## Operación diaria
Cuando alguien paga, abrís su nombre en el panel y tocás *Dar 30 días* (o 90 / 1 año). Al vencer, la app le muestra el cartel para renovar con tu link de pago y tu WhatsApp. Sus datos quedan guardados.

## Probar
```bash
createdb t && psql -d t -f supabase/tests/supabase_shim.sql -f supabase/base.sql -f supabase/tests/pruebas.sql
```
21 pruebas de seguridad y de reglas de acceso.

## Pendiente a futuro
- Cobro automático (Mercado Pago con aviso a una Edge Function): hoy la activación es manual desde el panel.
- Pasar a un dominio propio.
