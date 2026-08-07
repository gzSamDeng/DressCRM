create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  website text,
  country text default 'Turkey',
  city text,
  customer_type text,
  priority text not null default 'B' check (priority in ('A+','A','B','C','D')),
  stage text not null default 'New Lead',
  product_category text not null default 'Unclassified' check (product_category in ('Premium Evening Dress','Heavy Hand-beaded Couture','Both','Unclassified')),
  premium_fit integer not null default 0 check (premium_fit between 0 and 100),
  couture_fit integer not null default 0 check (couture_fit between 0 and 100),
  price_status text,
  price_example text,
  import_probability text,
  buyer_value text,
  contact_email text,
  whatsapp text,
  recommended_line text,
  evidence text,
  source_url text,
  notes text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_website_unique
on public.customers (lower(website))
where website is not null and website <> '';

create index if not exists customers_company_idx on public.customers (lower(company));
create index if not exists customers_priority_idx on public.customers (priority);
create index if not exists customers_stage_idx on public.customers (stage);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null,
  summary text not null,
  outcome text,
  next_action text,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists follow_ups_customer_idx on public.follow_ups(customer_id, happened_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.follow_ups enable row level security;

drop policy if exists "authenticated users manage customers" on public.customers;
create policy "authenticated users manage customers"
on public.customers for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated users manage followups" on public.follow_ups;
create policy "authenticated users manage followups"
on public.follow_ups for all
to authenticated
using (true)
with check (true);
