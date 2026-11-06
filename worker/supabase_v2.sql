-- In Supabase unter "SQL Editor" ausführen (nach supabase.sql)

create table if not exists users (
  discord_id text primary key,
  name text not null,
  avatar text,
  last_login timestamptz default now()
);

create table if not exists site_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8b5cf6',
  permissions text[] not null default '{}',
  created_at timestamptz default now()
);

create table if not exists user_site_roles (
  discord_id text not null references users(discord_id) on delete cascade,
  role_id uuid not null references site_roles(id) on delete cascade,
  primary key (discord_id, role_id)
);

alter table users enable row level security;
alter table site_roles enable row level security;
alter table user_site_roles enable row level security;
