-- Attribute reviews and follow-ups to authenticated sales users.
-- Historical rows remain unattributed because their author cannot be inferred safely.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (id, email, display_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1))
from auth.users
on conflict (id) do update set email = excluded.email;

create or replace function public.sync_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists sync_user_profile_after_auth_change on auth.users;
create trigger sync_user_profile_after_auth_change
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_user_profile();

alter table public.follow_ups add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.discovered_leads add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create index if not exists follow_ups_created_by_idx on public.follow_ups(created_by, happened_at desc);
create index if not exists discovered_leads_reviewed_by_idx on public.discovered_leads(reviewed_by, reviewed_at desc);

alter table public.user_profiles enable row level security;
drop policy if exists "authenticated users read profiles" on public.user_profiles;
create policy "authenticated users read profiles" on public.user_profiles
for select to authenticated using (true);
drop policy if exists "users update own profile" on public.user_profiles;
create policy "users update own profile" on public.user_profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
