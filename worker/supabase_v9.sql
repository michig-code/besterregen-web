-- In Supabase unter "SQL Editor" ausführen
alter table levels add column if not exists difficulty text;
alter table levels add column if not exists requirement int not null default 100;
alter table levels add column if not exists song text;
alter table levels add column if not exists objects int;
alter table levels add column if not exists nong text;
alter table levels add column if not exists creators text;
