create table public.payment_pins (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  pin_hash text not null,
  salt text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_pin_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  action text not null check (action in ('withdraw', 'supply', 'redeem')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index payment_pin_grants_user_idx
  on public.payment_pin_grants (user_id);

create trigger payment_pins_set_updated_at
before update on public.payment_pins
for each row
execute function public.set_updated_at();

alter table public.payment_pins enable row level security;
alter table public.payment_pin_grants enable row level security;
