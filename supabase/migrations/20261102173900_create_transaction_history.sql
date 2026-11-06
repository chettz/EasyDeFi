create type public.activity_type as enum (
  'SUPPLY',
  'REDEEM',
  'DEPOSIT',
  'WITHDRAW',
  'BRIDGE'
);

create type public.activity_status as enum (
  'PENDING',
  'CONFIRMED',
  'FAILED'
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.wallet_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  network text not null,
  chain_namespace text not null,
  address text not null,
  address_normalized text not null,
  last_synced_cursor text,
  created_at timestamptz not null default now(),

  unique (chain_namespace, address_normalized)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  wallet_address_id uuid references public.wallet_addresses(id) on delete set null,

  type public.activity_type not null,
  status public.activity_status not null default 'PENDING',
  idempotency_key text not null unique,

  network text not null,
  chain_namespace text not null,

  token_symbol text not null,
  token_address text,
  amount_raw numeric(78, 0) not null check (amount_raw >= 0),
  token_decimals smallint not null check (
    token_decimals >= 0 and token_decimals <= 30
  ),

  sender_address text,
  recipient_address text,
  primary_tx_hash text,

  fee_raw numeric(78, 0) check (fee_raw >= 0),
  fee_decimals smallint check (
    fee_decimals is null
    or (fee_decimals >= 0 and fee_decimals <= 30)
  ),
  fee_symbol text,

  occurred_at timestamptz not null default now(),
  confirmed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_transactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,

  network text not null,
  chain_namespace text not null,
  tx_hash text not null,
  event_index integer not null default -1,
  status public.activity_status not null default 'PENDING',

  block_number numeric(78, 0),
  sender_address text,
  recipient_address text,

  fee_raw numeric(78, 0) check (fee_raw >= 0),
  fee_decimals smallint check (
    fee_decimals is null
    or (fee_decimals >= 0 and fee_decimals <= 30)
  ),
  fee_symbol text,

  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (chain_namespace, tx_hash, event_index)
);

create index activities_user_date_idx
  on public.activities (user_id, occurred_at desc, id desc);

create index activities_user_type_date_idx
  on public.activities (user_id, type, occurred_at desc);

create index activities_status_idx
  on public.activities (status);

create index activity_transactions_activity_idx
  on public.activity_transactions (activity_id);

create index wallet_addresses_user_idx
  on public.wallet_addresses (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger activities_set_updated_at
before update on public.activities
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.wallet_addresses enable row level security;
alter table public.activities enable row level security;
alter table public.activity_transactions enable row level security;
