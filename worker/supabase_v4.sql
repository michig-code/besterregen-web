-- In Supabase unter "SQL Editor" ausführen (nach supabase_v3.sql)
alter table lists add column if not exists max_places int not null default 50;
update lists set max_places = 50 where slug = 'challenge';
