import fs from "node:fs/promises";

const inputFile = process.argv[2] || "data/global-evening-dress-leads.generated.json";
const outputFile = process.argv[3] || "supabase/import_global_evening_dress_leads.sql";
const report = JSON.parse(await fs.readFile(inputFile, "utf8"));
const payload = JSON.stringify(report.leads);
if (payload.includes("$global_leads$")) throw new Error("Unexpected SQL delimiter in payload");

const sql = `-- Generated global evening-dress buyer import.
-- Safe to re-run: source_key and normalized website checks prevent duplicates.

begin;

insert into public.intelligence_templates (
  product_line_id, version, market, keywords, negative_keywords, buyer_dna, score_rules, is_active
)
select
  pl.id,
  1,
  'Global Priority Markets',
  '["evening dress boutique retailer","plus size evening dress boutique","luxury beaded evening gown boutique"]'::jsonb,
  '["rental only","manufacturer","factory","marketplace","designer own brand"]'::jsonb,
  '[
    {"signal":"evening_dress_focus","label":"晚礼服是核心销售品类","weight":24},
    {"signal":"retailer_or_boutique","label":"精品店或专业零售商","weight":18},
    {"signal":"product_line_match","label":"简约、大码或重工产品线匹配","weight":14},
    {"signal":"premium_positioning","label":"中高端或设计师定位","weight":12},
    {"signal":"multi_brand","label":"多品牌采购能力","weight":10},
    {"signal":"wholesale_or_import","label":"进口、分销或批发证据","weight":8},
    {"signal":"physical_stores","label":"有实体门店或展厅","weight":6},
    {"signal":"public_contact_found","label":"有公开业务联系方式","weight":4}
  ]'::jsonb,
  '{"A+":80,"A":65,"B":45}'::jsonb,
  true
from public.product_lines pl
join public.industries i on i.id = pl.industry_id
where i.slug = 'fashion' and pl.slug = 'evening-dress'
on conflict (product_line_id, market, version) do update set
  keywords = excluded.keywords,
  negative_keywords = excluded.negative_keywords,
  buyer_dna = excluded.buyer_dna,
  score_rules = excluded.score_rules,
  is_active = true;

with
template as (
  select it.id
  from public.intelligence_templates it
  join public.product_lines pl on pl.id = it.product_line_id
  where pl.slug = 'evening-dress' and it.market = 'Global Priority Markets' and it.is_active = true
  order by it.version desc
  limit 1
),
job as (
  insert into public.search_jobs (template_id, query, connector, status, minimum_score, candidates_found, started_at)
  select
    id,
    'Global evening dress buyers: minimal premium, plus-size and heavily embellished; US, Canada, Europe, Russia, Australia, New Zealand and Gulf markets',
    'Serper + official website evidence',
    'running',
    56,
    0,
    now()
  from template
  returning id
),
payload as (
  select value as lead
  from jsonb_array_elements($global_leads$${payload}$global_leads$::jsonb)
),
deduplicated as (
  select p.lead
  from payload p
  where not exists (
    select 1
    from public.discovered_leads d
    where d.source_key = p.lead->>'source_key'
       or (
         coalesce(p.lead->>'website', '') <> ''
         and split_part(regexp_replace(lower(coalesce(d.website, '')), '^https?://(www\\.)?', ''), '/', 1)
           = split_part(regexp_replace(lower(p.lead->>'website'), '^https?://(www\\.)?', ''), '/', 1)
       )
  )
  and not exists (
    select 1
    from public.customers c
    where coalesce(p.lead->>'website', '') <> ''
      and split_part(regexp_replace(lower(coalesce(c.website, '')), '^https?://(www\\.)?', ''), '/', 1)
        = split_part(regexp_replace(lower(p.lead->>'website'), '^https?://(www\\.)?', ''), '/', 1)
  )
),
inserted as (
  insert into public.discovered_leads (
    search_job_id, source_key, company, website, country, city, customer_type,
    ai_score, ai_grade, confidence, signals, evidence, risks, recommendation,
    source_url, review_status, contact_email, contact_phone, whatsapp,
    exhibitor_source, contact_sources, data_completeness
  )
  select
    j.id,
    d.lead->>'source_key',
    d.lead->>'company',
    nullif(d.lead->>'website', ''),
    nullif(d.lead->>'country', ''),
    nullif(d.lead->>'city', ''),
    nullif(d.lead->>'customer_type', ''),
    (d.lead->>'ai_score')::integer,
    d.lead->>'ai_grade',
    initcap(coalesce(d.lead->>'confidence', 'medium')),
    coalesce((
      select jsonb_agg(signal_key order by signal_key)
      from jsonb_each(coalesce(d.lead->'signals', '{}'::jsonb)) as signal(signal_key, enabled)
      where enabled = 'true'::jsonb
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        concat_ws(' — ', nullif(item->>'title', ''), nullif(item->>'snippet', ''), nullif(item->>'url', ''))
      )
      from jsonb_array_elements(coalesce(d.lead->'evidence', '[]'::jsonb)) as item
    ), '[]'::jsonb),
    coalesce(d.lead->'risks', '[]'::jsonb),
    d.lead->>'recommendation',
    nullif(d.lead->>'source_url', ''),
    'pending',
    nullif(d.lead->>'contact_email', ''),
    nullif(d.lead->>'contact_phone', ''),
    nullif(d.lead->>'whatsapp', ''),
    '全球晚礼服买家搜索 · 2026-08-08',
    coalesce(d.lead->'contact_sources', '[]'::jsonb),
    greatest(0, least(100, coalesce((d.lead->>'data_completeness')::integer, 0)))
  from deduplicated d
  cross join job j
  on conflict (source_key) do nothing
  returning id
),
completed as (
  update public.search_jobs sj
  set status = 'complete',
      candidates_found = (select count(*) from inserted),
      completed_at = now()
  where sj.id = (select id from job)
  returning sj.id, sj.candidates_found
)
select id as search_job_id, candidates_found as inserted_leads
from completed;

commit;

select country, ai_grade, count(*) as pending_leads
from public.discovered_leads
where exhibitor_source = '全球晚礼服买家搜索 · 2026-08-08'
group by country, ai_grade
order by country, ai_grade;
`;

await fs.writeFile(outputFile, sql, "utf8");
console.log(`Built ${outputFile} for ${report.leads.length} leads`);
