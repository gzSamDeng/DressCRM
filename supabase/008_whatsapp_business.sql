-- Meta WhatsApp Business Platform message archive.
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
drop policy if exists "authenticated users read whatsapp messages" on public.whatsapp_messages;
create policy "authenticated users read whatsapp messages"
  on public.whatsapp_messages for select to authenticated using (true);
drop policy if exists "authenticated users insert whatsapp messages" on public.whatsapp_messages;
create policy "authenticated users insert whatsapp messages"
  on public.whatsapp_messages for insert to authenticated with check (sent_by = auth.uid());
