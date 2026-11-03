#!/usr/bin/env bash
# 30 personas intentan reservar el número 42 al mismo tiempo: solo una debe lograrlo.
# Uso: PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d t" ./concurrencia.sh  (después de pruebas.sql)
set -u
PSQL=${PSQL:-psql}
RAFFLE=20000000-0000-0000-0000-000000000001
$PSQL -q -c "insert into auth.users (id, email) select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@example.com' from generate_series(1, 30) g on conflict do nothing"
for g in $(seq 1 30); do
  uid="00000000-0000-0000-0001-$(printf '%012d' $g)"
  ( $PSQL -qAt -c "set request.jwt.claim.sub = '$uid'; set role authenticated; select 'OK ' || (reserve_numbers('$RAFFLE', array[42, $((g + 60))])).id;" 2>&1 | grep -oE '^OK|no está disponible' ) &
done | sort | uniq -c
wait
$PSQL -qAt -c "select 'reservas con el 42: ' || count(*) from reservations where 42 = any(numbers) and status = 'pending'"
