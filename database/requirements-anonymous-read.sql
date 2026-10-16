-- Explicit public read access for /requirements only. No write grants or audit changes.
begin;
do $$
declare tbl text;
begin
 foreach tbl in array array['master_requirement_type','master_requirement_priority','master_requirement_status','requirements','requirement_prs'] loop
   execute format('alter table public.%I enable row level security',tbl);
   execute format('grant select on public.%I to anon',tbl);
   if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='roava_requirement_anonymous_read') then
     if tbl like 'master_%' then
       execute format('create policy roava_requirement_anonymous_read on public.%I for select to anon using (true)',tbl);
     elsif tbl = 'requirements' then
       execute 'create policy roava_requirement_anonymous_read on public.requirements for select to anon using (valid)';
     else
       execute 'create policy roava_requirement_anonymous_read on public.requirement_prs for select to anon using (valid and exists(select 1 from public.requirements r where r.id=requirement_id and r.valid))';
     end if;
   end if;
 end loop;
end $$;
create or replace view public.requirement_listing with (security_invoker=true) as
 select r.*,t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status;
grant select on public.requirement_listing to anon;
notify pgrst,'reload schema';
commit;
