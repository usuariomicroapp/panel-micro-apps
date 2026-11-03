-- SORTEO · Tareas programadas con pg_cron (Supabase Cron, incluido en el plan gratuito).
-- Libera cada minuto las reservas vencidas sin comprobante enviado.
create extension if not exists pg_cron;

select cron.schedule(
  'sorteo-liberar-reservas-vencidas',
  '* * * * *',
  $$ select public.release_expired_reservations(); $$
);
