-- In Supabase unter "SQL Editor" ausführen (nach supabase.sql und supabase_v2.sql)

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  max_duration_seconds int,
  position int not null default 0,
  created_at timestamptz default now()
);

create table if not exists level_submissions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  name text not null,
  creator text not null,
  verifier text not null,
  gd_level_id text not null,
  video_url text not null,
  image_url text not null,
  duration_seconds int not null,
  submitted_by text not null,
  submitter_name text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists levels (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  position int not null default 0,
  name text not null,
  creator text not null,
  verifier text not null,
  gd_level_id text not null,
  video_url text not null,
  image_url text,
  duration_seconds int,
  submission_id uuid references level_submissions(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references levels(id) on delete cascade,
  player_name text not null,
  video_url text not null,
  notes text,
  submitted_by text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  reviewed_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value text
);

alter table lists enable row level security;
alter table level_submissions enable row level security;
alter table levels enable row level security;
alter table records enable row level security;
alter table settings enable row level security;

-- Erste Liste
insert into lists (name, slug, max_duration_seconds, position)
values ('Challenge List', 'challenge', 30, 1)
on conflict (slug) do nothing;
