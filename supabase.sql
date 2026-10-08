-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists recs (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  type       text not null default 'unknown' check (type in ('tv', 'movie', 'game', 'unknown')),
  why        text check (char_length(why) <= 500),
  notes      text check (char_length(notes) <= 500),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index if not exists recs_status_created_idx on recs (status, created_at desc);
create index if not exists recs_ip_created_idx on recs (ip_hash, created_at);

-- Row level security ON with no policies = the public anon key can't read or write anything.
-- Only the server-side service_role key (used by /api) can touch this table.
alter table recs enable row level security;
