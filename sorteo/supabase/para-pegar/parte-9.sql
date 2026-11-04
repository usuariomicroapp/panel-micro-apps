-- Detalle editable debajo de cada foto del premio.
alter table product_photos add column if not exists caption text not null default ''
  check (length(caption) <= 1000);
