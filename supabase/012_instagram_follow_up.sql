-- Instagram manual outreach channel.
-- Additive migration: preserves all existing customers and follow-up history.

alter table public.customers
  add column if not exists instagram text;

create index if not exists customers_instagram_idx
  on public.customers (lower(instagram))
  where instagram is not null and instagram <> '';

comment on column public.customers.instagram is
  'Public Instagram profile URL or handle used for manually confirmed outreach. Official Meta messaging APIs cannot initiate cold conversations.';
