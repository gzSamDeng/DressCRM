create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null default 'Email',
  summary text not null,
  outcome text,
  next_action text,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.follow_ups add column if not exists channel text not null default 'Email';
alter table public.follow_ups add column if not exists summary text;
alter table public.follow_ups add column if not exists outcome text;
alter table public.follow_ups add column if not exists next_action text;
alter table public.follow_ups add column if not exists happened_at timestamptz not null default now();
alter table public.follow_ups add column if not exists created_at timestamptz not null default now();
create index if not exists follow_ups_customer_idx on public.follow_ups(customer_id, happened_at desc);
alter table public.follow_ups enable row level security;
drop policy if exists "authenticated users manage followups" on public.follow_ups;
create policy "authenticated users manage followups" on public.follow_ups
for all to authenticated using (true) with check (true);
