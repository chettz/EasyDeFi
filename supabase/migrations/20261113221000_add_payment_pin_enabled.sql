alter table public.payment_pins
  add column if not exists enabled boolean not null default true;
