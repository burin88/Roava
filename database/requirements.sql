-- Additive, repeatable setup for Requirement Management. No existing data is replaced.
begin;
do $$
declare tbl text;
begin
  foreach tbl in array array['master_requirement_type','master_requirement_priority','master_requirement_status'] loop
    execute format('create table if not exists public.%I (
      id uuid primary key default gen_random_uuid(), code varchar(30) not null unique,
      name varchar(100) not null, description text, sort_sequence int not null default 0,
      created_at timestamptz not null default now(), created_by varchar(100) not null,
      modified_at timestamptz, modified_by varchar(100), valid boolean not null default true)',tbl);
  end loop;
end $$;
insert into public.master_requirement_type(code,name,sort_sequence,created_by) values
 ('BUG','Bug Fix',300,'SYSTEM'),('IMPROVEMENT','Improvement',200,'SYSTEM'),('FEATURE','New Feature',100,'SYSTEM') on conflict(code) do nothing;
insert into public.master_requirement_priority(code,name,sort_sequence,created_by) values
 ('CRITICAL','Critical',400,'SYSTEM'),('HIGH','High',300,'SYSTEM'),('MEDIUM','Medium',200,'SYSTEM'),('LOW','Low',100,'SYSTEM') on conflict(code) do nothing;
insert into public.master_requirement_status(code,name,sort_sequence,created_by) values
 ('PENDING','Pending',400,'SYSTEM'),('IN_PROGRESS','In Progress',300,'SYSTEM'),('COMPLETED','Completed',200,'SYSTEM'),('CANCELLED','Cancelled',100,'SYSTEM') on conflict(code) do nothing;
create table if not exists public.requirements (
 id uuid primary key default gen_random_uuid(), title varchar(255) not null, description text,
 requirement_type varchar(30) not null default 'FEATURE' references public.master_requirement_type(code),
 priority varchar(30) not null default 'MEDIUM' references public.master_requirement_priority(code),
 status varchar(30) not null default 'PENDING' references public.master_requirement_status(code),
 created_at timestamptz not null default now(), created_by varchar(100) not null,
 modified_at timestamptz, modified_by varchar(100), valid boolean not null default true
);
create table if not exists public.requirement_prs (
 id uuid primary key default gen_random_uuid(), requirement_id uuid not null references public.requirements(id),
 provider varchar(30) not null check(provider in ('GITHUB','AZURE_DEVOPS','GITLAB')),
 repository_name varchar(255), pr_number varchar(50), pr_url text not null,
 pr_status varchar(30) not null default 'OPEN' check(pr_status in ('OPEN','MERGED','CLOSED')),
 created_at timestamptz not null default now(), created_by varchar(100) not null,
 modified_at timestamptz, modified_by varchar(100), valid boolean not null default true,
 unique(requirement_id,pr_url)
);
create index if not exists requirements_status_idx on public.requirements(status);
create index if not exists requirements_type_idx on public.requirements(requirement_type);
create index if not exists requirements_priority_idx on public.requirements(priority);
create index if not exists requirements_pending_idx on public.requirements(created_at,id) where valid and status='PENDING';
create index if not exists requirements_owner_idx on public.requirements(created_by);
create index if not exists requirement_prs_parent_idx on public.requirement_prs(requirement_id);

-- Invoker triggers protect direct Data API access as well as application routes.
create or replace function public.roava_requirement_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare actor text := auth.uid()::text;
begin
 if TG_OP = 'UPDATE' then
   new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by;
   if TG_TABLE_NAME = 'requirement_prs' then
     if new.requirement_id is distinct from old.requirement_id then
       raise exception 'requirement_id is immutable';
     end if;
   end if;
   new.modified_at := now(); new.modified_by := coalesce(actor,new.modified_by);
 elsif actor is not null then
   new.id := gen_random_uuid(); new.created_at := now(); new.created_by := actor;
   new.modified_at := null; new.modified_by := null; new.valid := true;
 end if;
 if TG_TABLE_NAME = 'requirements' then
   new.title := btrim(new.title);
   if new.title = '' then raise exception 'title is required'; end if;
   if TG_OP = 'INSERT' or new.requirement_type is distinct from old.requirement_type then
     if not exists(select 1 from public.master_requirement_type where code=new.requirement_type and valid) then raise exception 'Invalid requirement_type'; end if;
   end if;
   if TG_OP = 'INSERT' or new.priority is distinct from old.priority then
     if not exists(select 1 from public.master_requirement_priority where code=new.priority and valid) then raise exception 'Invalid priority'; end if;
   end if;
   if TG_OP = 'INSERT' or new.status is distinct from old.status then
     if not exists(select 1 from public.master_requirement_status where code=new.status and valid) then raise exception 'Invalid status'; end if;
   end if;
 else
   if new.pr_url !~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' then raise exception 'HTTPS URL required'; end if;
   if not exists(select 1 from public.requirements where id=new.requirement_id and valid) then raise exception 'Active requirement required'; end if;
 end if;
 return new;
end $$;
revoke all on function public.roava_requirement_guard() from public,anon,authenticated;
do $$
declare tbl text;
begin
 foreach tbl in array array['master_requirement_type','master_requirement_priority','master_requirement_status','requirements','requirement_prs'] loop
   execute format('alter table public.%I enable row level security',tbl);
   execute format('revoke all on public.%I from anon,authenticated',tbl);
   execute format('grant select on public.%I to authenticated',tbl);
   if tbl like 'master_%' then
     -- Inactive masters remain readable for historical joins; lookup API filters valid.
     if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='roava_requirement_master_read') then
       execute format('create policy roava_requirement_master_read on public.%I for select to authenticated using (true)',tbl);
     end if;
   else
     execute format('grant insert,update on public.%I to authenticated',tbl);
     execute format('create or replace trigger roava_requirement_guard before insert or update on public.%I for each row execute function public.roava_requirement_guard()',tbl);
   end if;
 end loop;
end $$;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirements' and policyname='roava_requirement_read') then
   create policy roava_requirement_read on public.requirements for select to authenticated using(created_by=(select auth.uid())::text);
   create policy roava_requirement_insert on public.requirements for insert to authenticated with check(created_by=(select auth.uid())::text and valid);
   create policy roava_requirement_update on public.requirements for update to authenticated using(created_by=(select auth.uid())::text and valid) with check(created_by=(select auth.uid())::text and valid);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requirement_prs' and policyname='roava_requirement_pr_read') then
   create policy roava_requirement_pr_read on public.requirement_prs for select to authenticated using(
     exists(select 1 from public.requirements r where r.id=requirement_id and r.valid and r.created_by=(select auth.uid())::text));
   create policy roava_requirement_pr_insert on public.requirement_prs for insert to authenticated with check(valid and
     exists(select 1 from public.requirements r where r.id=requirement_id and r.valid and r.created_by=(select auth.uid())::text));
   create policy roava_requirement_pr_update on public.requirement_prs for update to authenticated using(valid and
     exists(select 1 from public.requirements r where r.id=requirement_id and r.valid and r.created_by=(select auth.uid())::text)) with check(valid and
     exists(select 1 from public.requirements r where r.id=requirement_id and r.valid and r.created_by=(select auth.uid())::text));
 end if;
end $$;
do $$ begin
execute 'create or replace view public.requirement_listing with (security_invoker=true) as
 select r.id,r.title,r.description,r.requirement_type,r.priority,r.status,
 r.created_at,r.created_by,r.modified_at,r.modified_by,r.valid,
 t.name as type_name,p.name as priority_name,s.name as status_name,
 t.sort_sequence as type_sequence,p.sort_sequence as priority_sequence,
 (select count(*) from public.requirement_prs pr where pr.requirement_id=r.id and pr.valid) as pr_count'
 || case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='requirements' and column_name='attachments_profiles_id') then ',r.attachments_id,r.attachments_profiles_id' else '' end
 || case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='requirements' and column_name='attachments') then ',r.attachments' else '' end
 || case when to_regprocedure('public.roava_requirement_attachment_urls(jsonb)') is not null then ',public.roava_requirement_attachment_urls(r.attachments) as attachment_urls' else '' end || '
 from public.requirements r
 join public.master_requirement_type t on t.code=r.requirement_type
 join public.master_requirement_priority p on p.code=r.priority
 join public.master_requirement_status s on s.code=r.status';
end $$;
revoke all on public.requirement_listing from anon,authenticated;
grant select on public.requirement_listing to authenticated;
notify pgrst,'reload schema';
commit;
