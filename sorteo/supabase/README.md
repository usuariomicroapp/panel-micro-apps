# Base de datos de SORTEO (Supabase)

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `migrations/20261103000001_esquema_inicial.sql` | Tablas, restricciones, índices, funciones seguras, RLS y buckets de Storage |
| `migrations/20261103000002_tareas_programadas.sql` | pg_cron: libera reservas vencidas cada minuto |
| `tests/supabase_shim.sql` | Solo pruebas locales: imita `auth`, `storage` y los roles de Supabase |
| `tests/pruebas.sql` | 37 pruebas de reglas, seguridad y pagos |
| `tests/concurrencia.sh` | 30 personas reservan el mismo número a la vez: solo una lo logra |

## Reglas que garantiza la base

- Cada número de cada sorteo es una fila única; reservar bloquea las filas en una transacción.
- El total se calcula en el servidor (cantidad × precio del sorteo).
- Enviar un comprobante **no** confirma nada: solo el administrador aprueba o rechaza.
- Un número pagado no vuelve a estar disponible por ninguna función.
- Las reservas `pending` vencen solas; las que tienen comprobante enviado esperan la revisión del administrador.
- Un sorteo no se activa sin sorteo oficial, fecha y regla para números no vendidos.
- Con ventas, no se puede cambiar precio ni reglas, y la grilla solo puede ampliarse.
- Los cobros arrancan apagados y no se pueden encender sin número de autorización (`settings`).
- Sorteos `is_demo = true` permiten probar todo el circuito sin cobros reales.
- Todo cambio importante queda en `audit_logs`, que no se puede editar ni borrar.
- RLS en todas las tablas: cada participante ve solo lo suyo; el costo de adquisición solo lo ve el admin.

## Aplicar en Supabase

1. En el proyecto de Supabase: SQL Editor → pegar y ejecutar `20261103000001_esquema_inicial.sql`, luego `20261103000002_tareas_programadas.sql`.
2. Registrarse en la app con la cuenta de Sebastián y ejecutar una vez:
   `update profiles set role = 'admin' where email = 'CORREO_DE_SEBASTIAN';`

## Probar localmente

```bash
createdb t
psql -d t -f tests/supabase_shim.sql
psql -d t -f migrations/20261103000001_esquema_inicial.sql
psql -d t -f tests/pruebas.sql
PSQL="psql -d t" ./tests/concurrencia.sh
```
