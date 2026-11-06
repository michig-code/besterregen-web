-- In Supabase unter "SQL Editor" ausführen: Bild bei Einreichungen wird optional
alter table level_submissions alter column image_url drop not null;
