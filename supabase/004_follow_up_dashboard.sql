create table if not exists public.customer_signals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  summary text,
  source_url text not null,
  signal_type text not null default 'news',
  relevance_score integer not null default 0 check (relevance_score between 0 and 100),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(customer_id, source_url)
);

create index if not exists customer_signals_customer_idx
on public.customer_signals(customer_id, relevance_score desc, created_at desc);

alter table public.customer_signals enable row level security;
drop policy if exists "authenticated users manage customer signals" on public.customer_signals;
create policy "authenticated users manage customer signals"
on public.customer_signals for all to authenticated using (true) with check (true);
