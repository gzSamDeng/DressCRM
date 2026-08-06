-- Fashion Prime 2025: only channel organizations that can introduce apparel buyers.
-- Ordinary fabric/accessory suppliers are intentionally excluded from the CRM review queue.

with template as (
  select id from public.intelligence_templates
  where market = 'Turkey' and is_active = true
  order by version desc limit 1
), job as (
  insert into public.search_jobs (
    template_id, query, connector, status, minimum_score,
    candidates_found, started_at, completed_at
  )
  select id,
    'Fashion Prime 2025 matched industry channel exhibitors',
    'Official exhibitor catalog and verified public contacts',
    'complete', 0, 6, now(), now()
  from template
  returning id
), leads (
  source_key, company, website, city, customer_type, ai_score, ai_grade,
  confidence, signals, evidence, risks, recommendation, contact_name,
  contact_email, contact_phone, address, contact_sources, data_completeness
) as (
  values
  (
    'fashion-prime-2025:world-of-the-fashion',
    'WORLD OF THE FASHION', 'https://www.worldofthefashion.com', 'İstanbul',
    'Fashion Industry Media / Buyer Channel', 48, 'B', 'High',
    '["international_brands","active_social"]'::jsonb,
    '["Fashion Prime 2025 official catalog lists the company as a sectoral publication","Public contact: Erkan Yılmaz, +90 212 431 05 99, seajans1@gmail.com"]'::jsonb,
    '["Industry media channel, not a direct buyer; confirm access to international evening-dress buyers"]'::jsonb,
    'Contact Erkan Yılmaz to explore buyer introductions, publication cooperation and access to international apparel brands.',
    'ERKAN YILMAZ', 'seajans1@gmail.com', '+90 212 431 05 99',
    'Sıracevizler Cad. No:38 Bomonti, İstanbul',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf","https://www.worldofthefashion.com"]'::jsonb, 100
  ),
  (
    'fashion-prime-2025:eib-apparel-exporters',
    'EGE HAZIR GİYİM VE KONFEKSİYON İHRACATÇILARI BİRLİĞİ', 'https://www.eib.org.tr', 'İzmir',
    'Apparel Exporters Association / Buyer Network Channel', 46, 'B', 'High',
    '["wholesale","international_brands"]'::jsonb,
    '["Fashion Prime 2025 official catalog lists the Aegean Apparel Exporters Association","Public contact: +90 232 488 60 00, konfeksiyon@eib.org.tr"]'::jsonb,
    '["Association/channel lead, not a direct purchasing company"]'::jsonb,
    'Ask for member directories, overseas buyer events and introductions to evening-dress importers and distributors.',
    '', 'konfeksiyon@eib.org.tr', '+90 232 488 60 00',
    'Atatürk Cad. No:382 Alsancak, İzmir',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf","https://www.eib.org.tr"]'::jsonb, 95
  ),
  (
    'fashion-prime-2025:mtk',
    'MTK MODA TEKSTİL SANAYİCİ VE İŞ ADAMLARI DERNEĞİ', 'https://www.mtksitesi.com', 'İzmir',
    'Fashion & Textile Business Association', 42, 'C', 'High',
    '["wholesale","active_social"]'::jsonb,
    '["Fashion Prime official catalog identifies MTK as a sector association","Public contact: Abdullah Salkım, +90 232 431 03 90, mehmet.balioglu@mtksitesi.com"]'::jsonb,
    '["Industry association; buyer fit must be confirmed member by member"]'::jsonb,
    'Request a shortlist of members serving evening-dress importers, boutiques or international distributors.',
    'ABDULLAH SALKIM', 'mehmet.balioglu@mtksitesi.com', '+90 232 431 03 90',
    'İzmir, Turkey',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf","https://www.mtksitesi.com"]'::jsonb, 95
  ),
  (
    'fashion-prime-2025:egsd',
    'EGE GİYİM SANAYİCİLERİ DERNEĞİ', 'https://www.egsd.org.tr', 'İzmir',
    'Apparel Manufacturers Association', 42, 'C', 'High',
    '["wholesale","international_brands"]'::jsonb,
    '["Fashion Prime official catalog identifies EGSD as an apparel industry association","Public contact: Hayati Ertuğrul, +90 232 446 46 93, info@egsd.org.tr"]'::jsonb,
    '["Association is primarily supplier-side; direct buyer access requires confirmation"]'::jsonb,
    'Ask EGSD for overseas buyer missions and members with established evening-dress export or distribution channels.',
    'HAYATİ ERTUĞRUL', 'info@egsd.org.tr', '+90 232 446 46 93',
    'İzmir, Turkey',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf","https://www.egsd.org.tr"]'::jsonb, 95
  ),
  (
    'fashion-prime-2025:mimar-kemalettin',
    'MİMAR KEMALETTİN MODA MERKEZİ DERNEĞİ', 'https://www.mkmoda.com', 'İzmir',
    'Fashion Trade Center Association', 42, 'C', 'High',
    '["wholesale","physical_stores"]'::jsonb,
    '["Fashion Prime official catalog lists the Mimar Kemalettin fashion center association","Public contact: Erdoğan Kulu, +90 232 441 44 06, dernek@mkmoda.org"]'::jsonb,
    '["Trade-center association; confirm which members are importers or multi-brand buyers"]'::jsonb,
    'Request member introductions focused on occasionwear wholesalers, retailers and cross-border purchasing.',
    'ERDOĞAN KULU', 'dernek@mkmoda.org', '+90 232 441 44 06',
    'İzmir, Turkey',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf","https://www.mkmoda.com"]'::jsonb, 95
  ),
  (
    'fashion-prime-2025:izmir-apparel-chamber',
    'İZMİR ELBİSECİLER VE BENZERLERİ ESNAF ODASI', null, 'İzmir',
    'Apparel Trades Chamber', 38, 'C', 'High',
    '["wholesale","physical_stores"]'::jsonb,
    '["Fashion Prime 2025 official catalog lists the İzmir apparel trades chamber","Public contact: Fatih Kıraç, +90 554 016 99 90, izmirelbisecilerodasi1958@gmail.com"]'::jsonb,
    '["Chamber/channel lead; member-level buyer qualification is still required"]'::jsonb,
    'Ask for evening-dress retailers, wholesalers and companies attending international sourcing events.',
    'FATİH KIRAÇ', 'izmirelbisecilerodasi1958@gmail.com', '+90 554 016 99 90',
    'Gaziosmanpaşa Bul. No:87/105-106 Çankaya, İzmir',
    '["https://fashionprime.izfas.com.tr/images2/img/1807/Image/fp-katalog-ff-25-1.pdf"]'::jsonb, 80
  )
)
insert into public.discovered_leads (
  source_key, search_job_id, company, website, country, city, customer_type,
  ai_score, ai_grade, confidence, signals, evidence, risks, recommendation,
  source_url, contact_name, contact_email, contact_phone, address,
  exhibitor_source, contact_sources, data_completeness, review_status
)
select source_key, job.id, company, website, 'Turkey', city, customer_type,
  ai_score, ai_grade, confidence, signals, evidence, risks, recommendation,
  'https://fashionprime.izfas.com.tr/katilimcilar-katilimci-listesi',
  contact_name, contact_email, contact_phone, address,
  'Fashion Prime 2025 official exhibitor catalog', contact_sources,
  data_completeness, 'pending'
from leads cross join job
on conflict (source_key) do update set
  search_job_id = excluded.search_job_id,
  company = excluded.company,
  website = excluded.website,
  city = excluded.city,
  customer_type = excluded.customer_type,
  ai_score = excluded.ai_score,
  ai_grade = excluded.ai_grade,
  confidence = excluded.confidence,
  signals = excluded.signals,
  evidence = excluded.evidence,
  risks = excluded.risks,
  recommendation = excluded.recommendation,
  source_url = excluded.source_url,
  contact_name = excluded.contact_name,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  address = excluded.address,
  exhibitor_source = excluded.exhibitor_source,
  contact_sources = excluded.contact_sources,
  data_completeness = excluded.data_completeness,
  review_status = 'pending';
