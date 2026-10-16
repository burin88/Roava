-- Install after requirements.sql and requirements-anonymous-read.sql.
-- Allows anyone to edit existing active PRs; it does not allow anonymous creation/deletion.
begin;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirement_prs' and policyname='roava_requirement_anonymous_read')
 or not exists(select 1 from pg_policies where schemaname='public' and tablename='requirements' and policyname='roava_requirement_anonymous_read') then
   raise exception 'Install requirements-anonymous-read.sql first';
 end if;
end $$;
alter table public.requirement_prs enable row level security;
-- Limit direct Data API writes to the same five business fields as PATCH.
revoke update on public.requirement_prs from anon;
grant update(provider,repository_name,pr_number,pr_url,pr_status,modified_at,modified_by) on public.requirement_prs to anon;
create or replace function public.roava_anonymous_pr_update_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user = 'anon' then
   new.id := old.id; new.requirement_id := old.requirement_id;
   new.created_at := old.created_at; new.created_by := old.created_by; new.valid := old.valid;
   new.modified_by := 'anonymous'; new.modified_at := now();
   if new.provider not in ('GITHUB','AZURE_DEVOPS','GITLAB') or new.provider is null
      or new.pr_status not in ('OPEN','MERGED','CLOSED') or new.pr_status is null then
     raise exception 'Invalid PR provider or status';
   end if;
   if new.pr_url is null or new.pr_url !~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' then
     raise exception 'HTTPS URL required';
   end if;
   if not exists(select 1 from public.requirements where id=new.requirement_id and valid) then
     raise exception 'Active requirement required';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.roava_anonymous_pr_update_guard() from public,anon,authenticated;
-- Runs after the standard requirement audit trigger, fixing anonymous audit identity.
create or replace trigger zz_roava_anonymous_pr_update before update on public.requirement_prs
 for each row execute function public.roava_anonymous_pr_update_guard();
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirement_prs' and policyname='roava_requirement_anonymous_update') then
   create policy roava_requirement_anonymous_update on public.requirement_prs for update to anon
   using(valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid))
   with check(valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid));
 end if;
end $$;
notify pgrst,'reload schema';
commit;
