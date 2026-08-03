-- Minimal per-user Gmail connection for the email follow-up MVP.
-- Tokens are readable only by their authenticated owner through RLS.

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  email text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create index if not exists email_accounts_user_idx
on public.email_accounts(user_id, provider);

alter table public.email_accounts enable row level security;

drop policy if exists "users read own email account" on public.email_accounts;
create policy "users read own email account"
on public.email_accounts for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users add own email account" on public.email_accounts;
create policy "users add own email account"
on public.email_accounts for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own email account" on public.email_accounts;
create policy "users update own email account"
on public.email_accounts for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users remove own email account" on public.email_accounts;
create policy "users remove own email account"
on public.email_accounts for delete to authenticated
using (user_id = auth.uid());
