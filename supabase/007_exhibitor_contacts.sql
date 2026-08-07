-- Public exhibitor contact enrichment for the AI review queue.
-- Additive only: existing leads and customers are preserved.

alter table public.discovered_leads
  add column if not exists source_key text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists linkedin text,
  add column if not exists address text,
  add column if not exists exhibitor_source text,
  add column if not exists contact_sources jsonb not null default '[]'::jsonb,
  add column if not exists data_completeness integer not null default 0
    check (data_completeness between 0 and 100);

create unique index if not exists discovered_leads_source_key_upsert_key
  on public.discovered_leads(source_key);

create index if not exists discovered_leads_exhibitor_source_idx
  on public.discovered_leads(exhibitor_source, review_status, ai_score desc);
