-- AI Lead Intelligence MVP
-- Additive migration: existing customers and follow-ups are not modified.

create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.product_lines (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.industries(id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(industry_id, slug)
);

create table if not exists public.intelligence_templates (
  id uuid primary key default gen_random_uuid(),
  product_line_id uuid not null references public.product_lines(id) on delete cascade,
  version integer not null default 1,
  market text not null,
  keywords jsonb not null default '[]'::jsonb,
  negative_keywords jsonb not null default '[]'::jsonb,
  buyer_dna jsonb not null default '[]'::jsonb,
  score_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(product_line_id, market, version)
);

create table if not exists public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.intelligence_templates(id),
  query text not null,
  connector text not null,
  status text not null default 'queued'
    check (status in ('queued','running','complete','failed')),
  minimum_score integer not null default 45,
  candidates_found integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.discovered_leads (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid not null references public.search_jobs(id) on delete cascade,
  company text not null,
  website text,
  country text,
  city text,
  customer_type text,
  ai_score integer not null check (ai_score between 0 and 100),
  ai_grade text not null check (ai_grade in ('A+','A','B','C','D')),
  confidence text,
  signals jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommendation text,
  source_url text,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  customer_id uuid references public.customers(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists discovered_leads_score_idx
  on public.discovered_leads(ai_score desc);
create index if not exists discovered_leads_review_idx
  on public.discovered_leads(review_status, created_at desc);

alter table public.industries enable row level security;
alter table public.product_lines enable row level security;
alter table public.intelligence_templates enable row level security;
alter table public.search_jobs enable row level security;
alter table public.discovered_leads enable row level security;

drop policy if exists "authenticated users read industries" on public.industries;
create policy "authenticated users read industries" on public.industries
  for select to authenticated using (true);
drop policy if exists "authenticated users read product lines" on public.product_lines;
create policy "authenticated users read product lines" on public.product_lines
  for select to authenticated using (true);
drop policy if exists "authenticated users read templates" on public.intelligence_templates;
create policy "authenticated users read templates" on public.intelligence_templates
  for select to authenticated using (true);
drop policy if exists "authenticated users manage search jobs" on public.search_jobs;
create policy "authenticated users manage search jobs" on public.search_jobs
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated users manage discovered leads" on public.discovered_leads;
create policy "authenticated users manage discovered leads" on public.discovered_leads
  for all to authenticated using (true) with check (true);

insert into public.industries (slug, name)
values ('fashion', 'Fashion')
on conflict (slug) do update set name = excluded.name;

insert into public.product_lines (industry_id, slug, name)
select id, 'evening-dress', 'Evening Dress'
from public.industries where slug = 'fashion'
on conflict (industry_id, slug) do update set name = excluded.name;

insert into public.intelligence_templates (
  product_line_id, version, market, keywords, negative_keywords, buyer_dna, score_rules
)
select
  id,
  1,
  'Turkey',
  '["evening dress boutique","luxury abiye","designer evening wear","occasion wear importer","multi-brand dress store"]'::jsonb,
  '["rental only","fast fashion","manufacturer only"]'::jsonb,
  '[
    {"signal":"importer","label":"有进口或国际采购证据","weight":24},
    {"signal":"premium_positioning","label":"客单价与品牌定位匹配","weight":18},
    {"signal":"evening_dress_focus","label":"晚礼服是核心品类","weight":16},
    {"signal":"multi_brand","label":"多品牌买手店/零售商","weight":14},
    {"signal":"wholesale","label":"具备批发或分销能力","weight":10},
    {"signal":"international_brands","label":"销售国际品牌","weight":8},
    {"signal":"physical_stores","label":"有实体门店网络","weight":6},
    {"signal":"active_social","label":"线上渠道持续活跃","weight":4}
  ]'::jsonb,
  '{"A+":80,"A":65,"B":45}'::jsonb
from public.product_lines where slug = 'evening-dress'
on conflict (product_line_id, market, version) do nothing;
