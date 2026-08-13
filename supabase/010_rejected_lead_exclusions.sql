alter table public.customers
  add column if not exists is_excluded boolean not null default false,
  add column if not exists exclusion_reason text,
  add column if not exists excluded_at timestamptz;

create index if not exists customers_active_idx
  on public.customers(is_excluded, priority, next_follow_up_at);

create table if not exists public.lead_exclusions (
  id uuid primary key default gen_random_uuid(),
  match_type text not null check (match_type in ('domain','email','company')),
  match_value text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique(match_type, match_value)
);

alter table public.lead_exclusions enable row level security;
drop policy if exists "authenticated users read lead exclusions" on public.lead_exclusions;
create policy "authenticated users read lead exclusions" on public.lead_exclusions
  for select to authenticated using (true);

insert into public.lead_exclusions (match_type, match_value, reason) values
  ('domain','istanbulfc.com','用户确认：电商平台，不属于目标礼服采购商'),
  ('company','istanbul fashion center','用户确认：istanbulfc.com 对应电商平台，不属于目标礼服采购商'),
  ('domain','selene-couture.com','用户确认：地区数据错误且不作为目标礼服线索'),
  ('domain','yahoo.com','用户确认：搜索/门户平台，不作为客户网站'),
  ('domain','missrunway.com','用户确认：旧域名，现网址为 missrunway.com.au，且不纳入目标线索'),
  ('domain','missrunway.com.au','用户确认：不属于当前目标礼服产品客户'),
  ('email','shop@missrunway.com','用户确认：旧邮箱域名对应的非目标客户'),
  ('email','janelabiye8@gmail.com','用户确认：民族服饰类型，产品不匹配'),
  ('company','janel abiye','用户确认：民族服饰类型，产品不匹配'),
  ('domain','lamaisonbridal.com','用户确认：婚纱类型，产品不匹配'),
  ('domain','polenpoe.com','用户确认：产品不匹配'),
  ('email','hello.ksa@stylishop.com','用户确认：产品不匹配'),
  ('domain','stylishop.com','用户确认：产品不匹配'),
  ('domain','annakoo.com','用户确认：中国手工礼服工厂，不是目标采购商')
on conflict (match_type, match_value) do update set reason = excluded.reason;

create or replace function public.normalized_lead_host(value text)
returns text
language sql
immutable
as $$
  select split_part(
    regexp_replace(lower(trim(coalesce(value, ''))), '^https?://(www\.)?', ''),
    '/',
    1
  );
$$;

create or replace function public.apply_discovered_lead_exclusion()
returns trigger
language plpgsql
as $$
declare
  matched_reason text;
begin
  select reason into matched_reason
  from public.lead_exclusions
  where
    (match_type = 'domain' and match_value = public.normalized_lead_host(new.website))
    or (match_type = 'email' and match_value = lower(trim(coalesce(new.contact_email, ''))))
    or (match_type = 'company' and lower(coalesce(new.company, '')) like '%' || match_value || '%')
  order by case match_type when 'email' then 1 when 'domain' then 2 else 3 end
  limit 1;

  if matched_reason is not null then
    new.review_status = 'rejected';
    new.reviewed_at = coalesce(new.reviewed_at, now());
    if not coalesce(new.risks, '[]'::jsonb) @> jsonb_build_array(matched_reason) then
      new.risks = coalesce(new.risks, '[]'::jsonb) || jsonb_build_array(matched_reason);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists discovered_leads_apply_exclusion on public.discovered_leads;
create trigger discovered_leads_apply_exclusion
before insert or update of company, website, contact_email
on public.discovered_leads
for each row execute function public.apply_discovered_lead_exclusion();

create or replace function public.apply_customer_exclusion()
returns trigger
language plpgsql
as $$
declare
  matched_reason text;
begin
  select reason into matched_reason
  from public.lead_exclusions
  where
    (match_type = 'domain' and match_value = public.normalized_lead_host(new.website))
    or (match_type = 'email' and match_value = lower(trim(coalesce(new.contact_email, ''))))
    or (match_type = 'company' and lower(coalesce(new.company, '')) like '%' || match_value || '%')
  order by case match_type when 'email' then 1 when 'domain' then 2 else 3 end
  limit 1;

  if matched_reason is not null then
    new.is_excluded = true;
    new.exclusion_reason = matched_reason;
    new.excluded_at = coalesce(new.excluded_at, now());
    new.stage = 'Rejected';
    new.next_follow_up_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_apply_exclusion on public.customers;
create trigger customers_apply_exclusion
before insert or update of company, website, contact_email
on public.customers
for each row execute function public.apply_customer_exclusion();

with rejected as (
  update public.discovered_leads
  set review_status = 'rejected',
      reviewed_at = now(),
      risks = coalesce(risks, '[]'::jsonb) || jsonb_build_array('用户确认：非目标礼服采购商，永久排除')
  where public.normalized_lead_host(website) in ('istanbulfc.com','selene-couture.com','yahoo.com','missrunway.com','missrunway.com.au','lamaisonbridal.com','polenpoe.com','stylishop.com','annakoo.com')
     or lower(coalesce(contact_email,'')) in ('shop@missrunway.com','janelabiye8@gmail.com','hello.ksa@stylishop.com')
     or lower(company) like any (array['%istanbul fashion center%','%janel abiye%','%la maison bridal%','%polen poe%','%stylishop%','%annakoo%'])
  returning id
), excluded_customers as (
  update public.customers
  set is_excluded = true,
      exclusion_reason = '用户确认：非目标礼服采购商，移出有效线索库',
      excluded_at = now(),
      stage = 'Rejected',
      next_follow_up_at = null
  where public.normalized_lead_host(website) in ('istanbulfc.com','selene-couture.com','yahoo.com','missrunway.com','missrunway.com.au','lamaisonbridal.com','polenpoe.com','stylishop.com','annakoo.com')
     or lower(coalesce(contact_email,'')) in ('shop@missrunway.com','janelabiye8@gmail.com','hello.ksa@stylishop.com')
     or lower(company) like any (array['%istanbul fashion center%','%janel abiye%','%la maison bridal%','%polen poe%','%stylishop%','%annakoo%'])
  returning id
)
select
  (select count(*) from rejected) as rejected_review_leads,
  (select count(*) from excluded_customers) as excluded_crm_customers;
