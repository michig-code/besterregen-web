-- In Supabase unter "SQL Editor" ausführen
create table if not exists guild_members (
  discord_id text primary key,
  name text not null,
  avatar text,
  updated_at timestamptz default now()
);
create index if not exists guild_members_name_idx on guild_members (name);

create table if not exists role_audit (
  id uuid primary key default gen_random_uuid(),
  actor_name text,
  target_discord_id text not null,
  target_name text,
  role_name text,
  action text not null check (action in ('add','remove')),
  created_at timestamptz default now()
);

alter table guild_members enable row level security;
alter table role_audit enable row level security;
