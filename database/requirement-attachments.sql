-- Install after requirements.sql and create-tables.sql (and anonymous setup, if used).
-- Keeps the existing per-profile attachment key; does not make IDs globally unique.
begin;
alter table public.requirements add column if not exists attachments_id varchar(128);
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='requirements' and column_name='attachments_id' and data_type<>'character varying') then
   alter table public.requirements alter column attachments_id type varchar(128) using attachments_id::varchar(128);
 end if;
end $$;
alter table public.requirements add column if not exists attachments_profiles_id uuid;
alter table public.attachments drop constraint if exists attachments_type_check;
alter table public.attachments add constraint attachments_type_check check(type in ('trip','place','expense','import','requirement'));
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.requirements'::regclass and conname='requirements_attachment_fkey') then
   alter table public.requirements add constraint requirements_attachment_fkey
     foreign key(attachments_profiles_id,attachments_id) references public.attachments(profiles_id,id) match full;
 end if;
end $$;
create index if not exists requirements_attachment_idx on public.requirements(attachments_profiles_id,attachments_id) where attachments_id is not null;

create or replace function public.roava_requirement_attachment_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP = 'UPDATE' then
   if (new.attachments_id,new.attachments_profiles_id) is not distinct from (old.attachments_id,old.attachments_profiles_id) then return new; end if;
 end if;
 if new.attachments_id is null then new.attachments_profiles_id := null; return new; end if;
 -- Only an uploader may attach a new image, including through direct Data API writes.
 new.attachments_profiles_id := auth.uid();
 if new.attachments_profiles_id is null or not exists(
   select 1 from public.attachments a where a.id=new.attachments_id and a.profiles_id=new.attachments_profiles_id
     and a.valid and a.type='requirement' and a.status='ready' and a.mime_type like 'image/%'
 ) then raise exception 'Active requirement image owned by current user required'; end if;
 return new;
end $$;
revoke all on function public.roava_requirement_attachment_guard() from public,anon,authenticated;
create or replace trigger ab_roava_requirement_attachment_guard before insert or update on public.requirements
 for each row execute function public.roava_requirement_attachment_guard();

-- Readers can see only images linked to a requirement they can already read.
alter table public.attachments enable row level security;
grant select(id,profiles_id,type,status,valid,mime_type) on public.attachments to anon;
drop policy if exists requirement_attachment_read on public.attachments;
create policy requirement_attachment_read on public.attachments for select to anon,authenticated using(
 valid and type='requirement' and status='ready' and exists(
   select 1 from public.requirements r where r.valid and r.attachments_id=attachments.id and r.attachments_profiles_id=attachments.profiles_id
 ));
-- Preserve anonymous text editing/removal when the shared-backlog setup is installed.
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='requirements' and policyname='roava_requirement_public_insert') then
   grant insert(attachments_id),update(attachments_id) on public.requirements to anon;
 end if;
end $$;

-- Append columns to the existing view without renaming its historical columns.
do $$ begin
execute 'create or replace view public.requirement_listing with (security_invoker=true) as
 select r.id,r.title,r.description,r.requirement_type,r.priority,r.status,
 r.created_at,r.created_by,r.modified_at,r.modified_by,r.valid,
 t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count,
 r.attachments_id,r.attachments_profiles_id'
 || case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='requirements' and column_name='attachments') then ',r.attachments' else '' end
 || case when to_regprocedure('public.roava_requirement_attachment_urls(jsonb)') is not null then ',public.roava_requirement_attachment_urls(r.attachments) as attachment_urls' else '' end || '
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status';
end $$;
notify pgrst,'reload schema';
commit;
