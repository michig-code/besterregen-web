-- In Supabase unter "SQL Editor" ausführen

create table if not exists sessions (
  id text primary key,
  discord_id text not null,
  discord_name text,
  access_token text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

create table if not exists verify_codes (
  discord_id text primary key,
  code text not null,
  expires_at timestamptz not null
);

create table if not exists gd_links (
  discord_id text primary key,
  gd_account_id text unique not null,
  gd_name text not null,
  verified_at timestamptz default now()
);

-- Der Worker nutzt den Service-Key, deshalb kein öffentlicher Zugriff nötig.
alter table sessions enable row level security;
alter table verify_codes enable row level security;
alter table gd_links enable row level security;
