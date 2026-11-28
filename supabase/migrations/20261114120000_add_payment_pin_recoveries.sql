create table public.payment_pin_recoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  method text not null check (method in ('email', 'wallet')),
  subject text not null,
  challenge text,
  token_hash text unique,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index payment_pin_recoveries_user_id_idx
  on public.payment_pin_recoveries (user_id, created_at desc);

alter table public.payment_pin_recoveries enable row level security;
