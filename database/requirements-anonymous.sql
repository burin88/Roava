-- Shared public Requirements backlog: anonymous SELECT / INSERT / UPDATE, no DELETE.
-- Install after requirements.sql. Supersedes the earlier read-only/PR-only scripts.
begin;
do $$
declare tbl text;
begin
 foreach tbl in array array['requirements','requirement_prs'] loop
   if not exists(select 1 from pg_trigger where tgrelid=format('public.%I',tbl)::regclass and tgname='roava_requirement_guard' and not tgisinternal and tgenabled <> 'D') then
     raise exception 'Install requirements.sql before enabling anonymous access';
   end if;
 end loop;
end $$;

-- Audit identity is determined by the database, including direct Data API writes.
create or replace function public.roava_requirement_anonymous_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user = 'anon' then
   if TG_OP = 'INSERT' then
     new.id := gen_random_uuid(); new.created_at := now(); new.created_by := 'anonymous';
     new.modified_at := null; new.modified_by := null; new.valid := true;
   else
     new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by; new.valid := old.valid;
     new.modified_at := now(); new.modified_by := 'anonymous';
     if TG_TABLE_NAME = 'requirement_prs' then
       if new.requirement_id is distinct from old.requirement_id then raise exception 'requirement_id is immutable'; end if;
     end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function public.roava_requirement_anonymous_audit() from public,anon,authenticated;
do $$
declare tbl text;
begin
 foreach tbl in array array['master_requirement_type','master_requirement_priority','master_requirement_status','requirements','requirement_prs'] loop
   execute format('alter table public.%I enable row level security',tbl);
   execute format('grant select on public.%I to anon,authenticated',tbl);
   if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='roava_requirement_public_read') then
     if tbl like 'master_%' then
       execute format('create policy roava_requirement_public_read on public.%I for select to anon,authenticated using (true)',tbl);
     elsif tbl = 'requirements' then
       execute 'create policy roava_requirement_public_read on public.requirements for select to anon,authenticated using (valid)';
     else
       execute 'create policy roava_requirement_public_read on public.requirement_prs for select to anon,authenticated using (valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid))';
     end if;
   end if;
   if tbl in ('requirements','requirement_prs') then
     -- Alphabetical trigger order ensures audit values are set before validation.
     execute format('create or replace trigger aa_roava_requirement_anonymous_audit before insert or update on public.%I for each row execute function public.roava_requirement_anonymous_audit()',tbl);
   end if;
 end loop;
end $$;
-- Masters remain read-only; do not grant deletion, identity or parent reassignment.
grant insert(title,description,requirement_type,priority,status,created_by) on public.requirements to anon;
grant update(title,description,requirement_type,priority,status,modified_at,modified_by) on public.requirements to anon;
grant insert(requirement_id,provider,repository_name,pr_number,pr_url,pr_status,created_by) on public.requirement_prs to anon;
grant update(provider,repository_name,pr_number,pr_url,pr_status,modified_at,modified_by) on public.requirement_prs to anon;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirements' and policyname='roava_requirement_public_insert') then
   create policy roava_requirement_public_insert on public.requirements for insert to anon,authenticated
   with check(valid and created_by=coalesce((select auth.uid())::text,'anonymous'));
   create policy roava_requirement_public_update on public.requirements for update to anon,authenticated
   using(valid) with check(valid);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirement_prs' and policyname='roava_requirement_public_insert') then
   create policy roava_requirement_public_insert on public.requirement_prs for insert to anon,authenticated
   with check(valid and created_by=coalesce((select auth.uid())::text,'anonymous') and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid));
   create policy roava_requirement_public_update on public.requirement_prs for update to anon,authenticated
   using(valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid))
   with check(valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid));
 end if;
end $$;
create or replace view public.requirement_listing with (security_invoker=true) as
 select r.*,t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status;
grant select on public.requirement_listing to anon,authenticated;
notify pgrst,'reload schema';
commit;
