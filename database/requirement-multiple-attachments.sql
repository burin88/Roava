-- Install after requirement-attachments.sql. Preserve the old single-image columns
-- as the first-image mirror for existing clients; the collection is authoritative.
begin;
alter table public.requirements add column if not exists attachments jsonb not null default '[]'::jsonb;
update public.requirements set attachments=jsonb_build_array(jsonb_build_object('id',attachments_id,'profiles_id',attachments_profiles_id))
 where attachments='[]'::jsonb and attachments_id is not null;

create or replace function public.roava_requirement_attachment_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; previous jsonb := '[]'::jsonb; seen text[] := '{}'; image_key text;
begin
 if TG_OP='UPDATE' then
   previous := old.attachments;
   -- Support old clients changing the single-image field.
   if new.attachments is not distinct from old.attachments then
     if (new.attachments_id,new.attachments_profiles_id) is not distinct from (old.attachments_id,old.attachments_profiles_id) then return new; end if;
     new.attachments := case when new.attachments_id is null then '[]'::jsonb else
       jsonb_build_array(jsonb_build_object('id',new.attachments_id,'profiles_id',auth.uid())) end;
   end if;
 elsif new.attachments='[]'::jsonb and new.attachments_id is not null then
   new.attachments := jsonb_build_array(jsonb_build_object('id',new.attachments_id,'profiles_id',auth.uid()));
 end if;
 if new.attachments is null or jsonb_typeof(new.attachments)<>'array' then raise exception 'Images must be an array'; end if;
 if jsonb_array_length(new.attachments)>20 then raise exception 'Maximum 20 images'; end if;
 for item in select value from jsonb_array_elements(new.attachments) loop
   if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2
     or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'profiles_id') is distinct from 'string'
     or item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or item->>'profiles_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then raise exception 'Invalid image reference'; end if;
   image_key := (item->>'profiles_id') || '/' || (item->>'id');
   if image_key=any(seen) then raise exception 'Duplicate image'; end if;
   seen := array_append(seen,image_key);
   -- Retaining another uploader's existing reference is allowed in a shared backlog.
   if not previous @> jsonb_build_array(item) then
     if item->>'profiles_id' is distinct from auth.uid()::text or not exists(
       select 1 from public.attachments a where a.id=item->>'id' and a.profiles_id=(item->>'profiles_id')::uuid
         and a.valid and a.type='requirement' and a.status='ready' and a.mime_type like 'image/%'
     ) then raise exception 'Active requirement image owned by current user required'; end if;
   end if;
 end loop;
 new.attachments_id := new.attachments->0->>'id';
 new.attachments_profiles_id := (new.attachments->0->>'profiles_id')::uuid;
 return new;
end $$;
revoke all on function public.roava_requirement_attachment_guard() from public,anon,authenticated;

drop policy if exists requirement_attachment_read on public.attachments;
create policy requirement_attachment_read on public.attachments for select to anon,authenticated using(
 valid and type='requirement' and status='ready' and exists(
   select 1 from public.requirements r where r.valid and r.attachments @>
     jsonb_build_array(jsonb_build_object('id',attachments.id,'profiles_id',attachments.profiles_id))
 ));
do $$ begin
 if exists(select 1 from pg_policies where schemaname='public' and tablename='requirements' and policyname='roava_requirement_public_insert') then
   grant insert(attachments),update(attachments) on public.requirements to anon;
 end if;
end $$;
do $$ begin
execute 'create or replace view public.requirement_listing with (security_invoker=true) as
 select r.id,r.title,r.description,r.requirement_type,r.priority,r.status,
 r.created_at,r.created_by,r.modified_at,r.modified_by,r.valid,
 t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count,
 r.attachments_id,r.attachments_profiles_id,r.attachments'
 || case when to_regprocedure('public.roava_requirement_attachment_urls(jsonb)') is not null then ',public.roava_requirement_attachment_urls(r.attachments) as attachment_urls' else '' end || '
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status';
end $$;
notify pgrst,'reload schema';
commit;
