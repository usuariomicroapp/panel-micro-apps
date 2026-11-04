-- Arreglo: PostgreSQL no acepta repeticiones mayores a 255 en una expresión regular,
-- así que la regla anterior ({1,300}) hacía fallar cualquier foto de producto.
alter table product_photos drop constraint if exists product_photos_path_check;
alter table product_photos add constraint product_photos_path_check
  check (path ~ '^[A-Za-z0-9/_.-]{1,255}$');
