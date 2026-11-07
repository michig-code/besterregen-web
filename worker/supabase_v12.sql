-- In Supabase unter "SQL Editor" ausführen
alter table lists add column if not exists scoring text not null default 'linear';
alter table records add column if not exists percent int not null default 100;
