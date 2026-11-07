-- In Supabase unter "SQL Editor" ausführen
alter table levels add column if not exists is_beat boolean not null default false;

create table if not exists level_contributors (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references levels(id) on delete cascade,
  name text not null,
  part text,
  discord_id text,
  position int not null default 0
);
alter table level_contributors enable row level security;
