#!/usr/bin/env bash
# 30 personas eligen el número 42 del mismo sorteo al mismo tiempo: solo una debe quedárselo.
# Uso: PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d t" ./concurrencia-elegir.sh  (con todas las migraciones)
set -u
PSQL=${PSQL:-psql}
RAFFLE=20000000-0000-0000-0000-0000000000c9
$PSQL -q -c "insert into auth.users (id, email) select ('00000000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'c' || g || '@example.com' from generate_series(1, 30) g on conflict do nothing" \
  -c "update profiles set first_name = 'Persona', phone = '11 1111-1111' where email like 'c%@example.com'" \
  -c "insert into raffles (id, name, product_id, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy, max_numbers_per_reservation) values ('$RAFFLE', 'Carrera', '10000000-0000-0000-0000-000000000001', now() + interval '3 days', now() - interval '1 minute', false, 'active', current_date + 3, 'nocturna', 'desierto', 2) on conflict do nothing"
for g in $(seq 1 30); do
  uid="00000000-0000-0000-0002-$(printf '%012d' $g)"
  ( $PSQL -qAt -c "set request.jwt.claim.sub = '$uid'; set role authenticated; select 'OK ' || (claim_numbers('$RAFFLE', array[42, $((g + 50))])).id;" 2>&1 | grep -oE '^OK|no está disponible' ) &
done | sort | uniq -c
wait
$PSQL -qAt -c "select 'anotaciones con el 42: ' || count(*) from reservations where raffle_id = '$RAFFLE' and 42 = any(numbers) and status = 'approved'" \
  -c "select 'número 42 ocupado una vez: ' || (count(*) = 1) from raffle_numbers where raffle_id = '$RAFFLE' and number = 42 and state <> 'available'"
