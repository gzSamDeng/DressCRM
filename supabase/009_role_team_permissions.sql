-- Role, team and record ownership for the multi-user sales workspace.
-- Existing business data is preserved and assigned to the current system owner.

create table if not exists public.sales_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sales_teams (name)
values ('销售团队')
on conflict (name) do nothing;

alter table public.user_profiles
  add column if not exists role text not null default 'sales_rep',
  add column if not exists team_id uuid references public.sales_teams(id) on delete set null,
  add column if not exists manager_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_role_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_role_check
      check (role in ('sales_rep', 'sales_director', 'owner'));
  end if;
end $$;

update public.user_profiles
set team_id = (select id from public.sales_teams where name = '销售团队' limit 1)
where team_id is null;

update public.user_profiles
set role = 'owner', is_active = true
where lower(email) = 'abrahamlinkin@126.com';

alter table public.customers
  add column if not exists owner_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists assigned_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz;

alter table public.customers alter column owner_id set default auth.uid();

update public.customers
set owner_id = (
  select id from public.user_profiles where role = 'owner' order by created_at limit 1
), assigned_at = coalesce(assigned_at, now())
where owner_id is null
  and exists (select 1 from public.user_profiles where role = 'owner');

create index if not exists user_profiles_role_team_idx
  on public.user_profiles(role, team_id, is_active);
create index if not exists customers_owner_idx
  on public.customers(owner_id, priority, next_follow_up_at);

-- Some early production environments skipped the dashboard signal migration.
-- Keep this migration self-contained so the management dashboard can always load.
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

-- Keep the optional WhatsApp Business archive compatible with environments
-- that currently use manual WhatsApp follow-up only.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text not null,
  to_number text not null,
  contact_name text,
  message_type text not null default 'text',
  text_body text,
  media_id text,
  media_mime_type text,
  status text not null default 'received',
  error_text text,
  raw_payload jsonb,
  sent_by uuid references auth.users(id) on delete set null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_customer_idx
  on public.whatsapp_messages(customer_id, happened_at desc);
create index if not exists whatsapp_messages_phone_idx
  on public.whatsapp_messages(from_number, to_number, happened_at desc);
alter table public.whatsapp_messages enable row level security;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.user_profiles where id = auth.uid()), 'sales_rep');
$$;

create or replace function public.current_app_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from public.user_profiles where id = auth.uid()), false);
$$;

create or replace function public.current_app_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.user_profiles where id = auth.uid();
$$;

create or replace function public.current_app_permission(permission_name text, default_value boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.current_app_is_active() then false
    when public.current_app_role() = 'owner' then true
    else coalesce(
      ((select permissions from public.user_profiles where id = auth.uid()) ->> permission_name)::boolean,
      default_value
    )
  end;
$$;

create or replace function public.can_view_app_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_is_active() and (
    target_user_id = auth.uid()
    or public.current_app_role() = 'owner'
    or (
      public.current_app_role() = 'sales_director'
      and exists (
        select 1 from public.user_profiles target
        where target.id = target_user_id
          and target.team_id = public.current_app_team_id()
      )
    )
  );
$$;

create or replace function public.can_access_customer(customer_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_is_active() and (
    public.current_app_role() = 'owner'
    or customer_owner_id = auth.uid()
    or (
      public.current_app_role() = 'sales_director'
      and (
        customer_owner_id is null
        or exists (
          select 1 from public.user_profiles target
          where target.id = customer_owner_id
            and target.team_id = public.current_app_team_id()
        )
      )
    )
  );
$$;

alter table public.sales_teams enable row level security;
drop policy if exists "authenticated users read sales teams" on public.sales_teams;
drop policy if exists "role scoped profile access" on public.user_profiles;
drop policy if exists "role scoped customer read" on public.customers;
drop policy if exists "role scoped customer insert" on public.customers;
drop policy if exists "role scoped customer update" on public.customers;
drop policy if exists "owner customer delete" on public.customers;
drop policy if exists "role scoped followup read" on public.follow_ups;
drop policy if exists "role scoped followup insert" on public.follow_ups;
drop policy if exists "own followup update" on public.follow_ups;
drop policy if exists "role scoped customer signals" on public.customer_signals;
drop policy if exists "authenticated users create customer signals" on public.customer_signals;
drop policy if exists "authorized users read discovered leads" on public.discovered_leads;
drop policy if exists "authorized users review discovered leads" on public.discovered_leads;
drop policy if exists "authorized users create discovered leads" on public.discovered_leads;
drop policy if exists "authorized users read search jobs" on public.search_jobs;
drop policy if exists "authorized users create search jobs" on public.search_jobs;
drop policy if exists "authorized users update own search jobs" on public.search_jobs;
drop policy if exists "role scoped whatsapp read" on public.whatsapp_messages;
drop policy if exists "authenticated users insert whatsapp messages" on public.whatsapp_messages;
drop policy if exists "role scoped whatsapp insert" on public.whatsapp_messages;
create policy "authenticated users read sales teams" on public.sales_teams
  for select to authenticated using (true);

drop policy if exists "authenticated users read profiles" on public.user_profiles;
drop policy if exists "users update own profile" on public.user_profiles;
create policy "role scoped profile access" on public.user_profiles
  for select to authenticated using (public.can_view_app_user(id));

drop policy if exists "authenticated users manage customers" on public.customers;
create policy "role scoped customer read" on public.customers
  for select to authenticated using (public.can_access_customer(owner_id));
create policy "role scoped customer insert" on public.customers
  for insert to authenticated with check (
    owner_id = auth.uid()
    or (public.current_app_role() in ('owner', 'sales_director') and public.can_access_customer(owner_id))
  );
create policy "role scoped customer update" on public.customers
  for update to authenticated
  using (public.can_access_customer(owner_id))
  with check (public.can_access_customer(owner_id));
create policy "owner customer delete" on public.customers
  for delete to authenticated using (public.current_app_permission('can_delete_customers', false));

drop policy if exists "authenticated users manage followups" on public.follow_ups;
create policy "role scoped followup read" on public.follow_ups
  for select to authenticated using (
    exists (
      select 1 from public.customers c
      where c.id = follow_ups.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );
create policy "role scoped followup insert" on public.follow_ups
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.customers c
      where c.id = follow_ups.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );
create policy "own followup update" on public.follow_ups
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "authenticated users manage customer signals" on public.customer_signals;
create policy "role scoped customer signals" on public.customer_signals
  for select to authenticated using (
    exists (
      select 1 from public.customers c
      where c.id = customer_signals.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );
create policy "authenticated users create customer signals" on public.customer_signals
  for insert to authenticated with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_signals.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );

drop policy if exists "authenticated users manage discovered leads" on public.discovered_leads;
create policy "authorized users read discovered leads" on public.discovered_leads
  for select to authenticated using (public.current_app_permission('can_review_leads', true));
create policy "authorized users review discovered leads" on public.discovered_leads
  for update to authenticated
  using (public.current_app_permission('can_review_leads', true))
  with check (public.current_app_permission('can_review_leads', true));
create policy "authorized users create discovered leads" on public.discovered_leads
  for insert to authenticated with check (public.current_app_permission('can_run_ai_search', true));

drop policy if exists "authenticated users manage search jobs" on public.search_jobs;
create policy "authorized users read search jobs" on public.search_jobs
  for select to authenticated using (public.current_app_permission('can_review_leads', true));
create policy "authorized users create search jobs" on public.search_jobs
  for insert to authenticated with check (
    public.current_app_permission('can_run_ai_search', true)
    and created_by = auth.uid()
  );
create policy "authorized users update own search jobs" on public.search_jobs
  for update to authenticated
  using (created_by = auth.uid() or public.current_app_role() = 'owner')
  with check (created_by = auth.uid() or public.current_app_role() = 'owner');

drop policy if exists "authenticated users read whatsapp messages" on public.whatsapp_messages;
create policy "role scoped whatsapp read" on public.whatsapp_messages
  for select to authenticated using (
    customer_id is not null
    and exists (
      select 1 from public.customers c
      where c.id = whatsapp_messages.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );
create policy "role scoped whatsapp insert" on public.whatsapp_messages
  for insert to authenticated with check (
    sent_by = auth.uid()
    and customer_id is not null
    and exists (
      select 1 from public.customers c
      where c.id = whatsapp_messages.customer_id
        and public.can_access_customer(c.owner_id)
    )
  );

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_is_active() to authenticated;
grant execute on function public.current_app_team_id() to authenticated;
grant execute on function public.current_app_permission(text, boolean) to authenticated;
grant execute on function public.can_view_app_user(uuid) to authenticated;
grant execute on function public.can_access_customer(uuid) to authenticated;
