-- Customs-import intelligence: keep one review lead per company while preserving
-- every unique shipment date and source row for later follow-up.

alter table public.discovered_leads
  add column if not exists lead_source text not null default 'ai_search',
  add column if not exists customs_import_count integer not null default 0,
  add column if not exists first_customs_import_at date,
  add column if not exists latest_customs_import_at date,
  add column if not exists customs_source_label text;

alter table public.customers
  add column if not exists has_customs_import_records boolean not null default false,
  add column if not exists customs_import_count integer not null default 0,
  add column if not exists first_customs_import_at date,
  add column if not exists latest_customs_import_at date;

create table if not exists public.customs_import_records (
  id uuid primary key default gen_random_uuid(),
  record_fingerprint text not null unique,
  discovered_lead_id uuid not null references public.discovered_leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  import_date date not null,
  importer_country text,
  importer_name_raw text not null,
  seller_country text,
  supplier_name text,
  origin_country text,
  hs_code text,
  product_description text,
  trade_type text,
  quantity_raw text,
  amount_raw text,
  weight_raw text,
  source_label text not null default '中国出口礼服海关进口数据',
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists customs_import_records_lead_idx
  on public.customs_import_records(discovered_lead_id, import_date desc);
create index if not exists customs_import_records_customer_idx
  on public.customs_import_records(customer_id, import_date desc);
create index if not exists customers_customs_import_idx
  on public.customers(has_customs_import_records, latest_customs_import_at desc);

alter table public.customs_import_records enable row level security;

drop policy if exists "authorized users read customs imports" on public.customs_import_records;
drop policy if exists "authorized users create customs imports" on public.customs_import_records;
drop policy if exists "authorized users update customs imports" on public.customs_import_records;

create policy "authorized users read customs imports" on public.customs_import_records
  for select to authenticated using (
    public.current_app_permission('can_review_leads', true)
    or (
      customer_id is not null
      and exists (
        select 1 from public.customers c
        where c.id = customs_import_records.customer_id
          and public.can_access_customer(c.owner_id)
      )
    )
  );
create policy "authorized users create customs imports" on public.customs_import_records
  for insert to authenticated with check (public.current_app_permission('can_run_ai_search', true));
create policy "authorized users update customs imports" on public.customs_import_records
  for update to authenticated
  using (public.current_app_permission('can_review_leads', true))
  with check (public.current_app_permission('can_review_leads', true));

