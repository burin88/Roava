-- Upgrade existing databases without deleting/reimporting rows.
-- profiles.owner_id -> users_id (references auth.users).
-- Other tables: owner_id -> profiles_id (references profiles.id).
-- Foreign-key names use the complete referenced table name + _id.
-- UUID values, primary/foreign key relationships and RLS remain intact.
begin;
do $$
declare t text; target_column text; mapping record; constraint_row record; id_attribute smallint;
begin
  foreach t in array array['profiles','journeys','trips','trip_places','expenses',
    'attachments','trip_attachments','place_attachments','expense_attachments'] loop
    target_column := case when t='profiles' then 'users_id' else 'profiles_id' end;
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=t and column_name='owner_id') then
      execute format('alter table public.%I rename column owner_id to %I',t,target_column);
    elsif not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=t and column_name=target_column) then
      raise exception 'Expected ownership column is missing from public.%',t;
    end if;
  end loop;
  for mapping in select * from (values
    ('trips','journey_id','journeys_id'),
    ('trip_places','trip_id','trips_id'),
    ('expenses','trip_id','trips_id'),
    ('trip_attachments','trip_id','trips_id'),
    ('trip_attachments','attachment_id','attachments_id'),
    ('place_attachments','place_id','trip_places_id'),
    ('place_attachments','attachment_id','attachments_id'),
    ('expense_attachments','expense_id','expenses_id'),
    ('expense_attachments','attachment_id','attachments_id')
  ) as names(table_name, old_name, new_name) loop
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=mapping.table_name and column_name=mapping.old_name) then
      execute format('alter table public.%I rename column %I to %I',mapping.table_name,mapping.old_name,mapping.new_name);
    elsif not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=mapping.table_name and column_name=mapping.new_name) then
      raise exception 'Expected foreign-key column is missing from %.%',mapping.table_name,mapping.new_name;
    end if;
  end loop;

  -- Move profile references from the Auth-user column to the actual master ID.
  -- Existing profiles enforce id::text = users_id::text, so UUIDs are preserved.
  for constraint_row in select conrelid::regclass as relation_name, conname from pg_constraint
    where contype='f' and confrelid='public.profiles'::regclass
      and conrelid in ('public.journeys'::regclass,'public.trips'::regclass,'public.attachments'::regclass) loop
    execute format('alter table %s drop constraint %I',constraint_row.relation_name,constraint_row.conname);
  end loop;
  select attnum into id_attribute from pg_attribute
    where attrelid='public.profiles'::regclass and attname='id';
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='profiles' and column_name='id' and data_type<>'uuid') then
    for constraint_row in select conname from pg_constraint
      where conrelid='public.profiles'::regclass and contype='c' and id_attribute=any(conkey) loop
      execute format('alter table public.profiles drop constraint %I',constraint_row.conname);
    end loop;
    alter table public.profiles alter column id drop default;
    alter table public.profiles alter column id type uuid using id::uuid;
    alter table public.profiles alter column id set default auth.uid();
    alter table public.profiles add constraint profiles_id_matches_users_id check(id=users_id);
  end if;
  for constraint_row in select conname from pg_constraint
    where conrelid='public.profiles'::regclass and contype='p' and conkey<>array[id_attribute] loop
    execute format('alter table public.profiles drop constraint %I',constraint_row.conname);
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and contype='p') then
    alter table public.profiles add primary key(id);
  end if;
  foreach t in array array['journeys','trips','attachments'] loop
    execute format('alter table public.%I add constraint %I foreign key(profiles_id) references public.profiles(id)',
      t,t||'_profiles_id_fkey');
  end loop;
end;
$$;

-- Add application RPCs to the existing 9-table schema. Safe to rerun.
-- Every function is SECURITY INVOKER: RLS and table privileges still apply.

alter table public.expenses add column if not exists sort_order integer not null default 0;

-- Add application RPCs to the existing 9-table schema. Safe to rerun.
-- Every function is SECURITY INVOKER: RLS and table privileges still apply.

alter table public.expenses add column if not exists sort_order integer not null default 0;

-- Add application RPCs to the existing 9-table schema. Safe to rerun.
-- Every function is SECURITY INVOKER: RLS and table privileges still apply.

alter table public.expenses add column if not exists sort_order integer not null default 0;

create or replace function public.roava_audit_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if (to_jsonb(new)->>(case when TG_TABLE_NAME='profiles' then 'users_id' else 'profiles_id' end))
      is distinct from (to_jsonb(old)->>(case when TG_TABLE_NAME='profiles' then 'users_id' else 'profiles_id' end))
      or new.id is distinct from old.id then
      raise exception 'Record identity and owner cannot be changed';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.modified_at := clock_timestamp();
    new.modified_by := coalesce(auth.uid()::text, new.modified_by);
  elsif auth.uid() is not null then
    new.created_at := clock_timestamp();
    new.created_by := auth.uid()::text;
    new.modified_at := new.created_at;
    new.modified_by := new.created_by;
  end if;
  return new;
end;
$$;
revoke all on function public.roava_audit_row() from public, anon, authenticated;


create or replace function public.roava_read_document() returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object('schemaVersion', 1,
  'profile', jsonb_build_object('displayName', coalesce((select display_name from public.profiles where users_id = auth.uid() and valid), 'My Atlas')),
  'trips', coalesce((select jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'countryCode', t.country_code, 'cityCode', t.city_code,
    'cityName', t.city_name, 'provinceCode', t.province_code, 'journeyGroupId', t.journeys_id,
    'startDate', t.start_date, 'endDate', t.end_date, 'timezone', t.timezone,
    'description', coalesce(t.description,''), 'notes', coalesce(t.notes,''),
    'transport', t.transport, 'hotel', t.hotel, 'restaurant', t.restaurant,
    'ticket', t.ticket, 'route', t.route, 'rating', t.rating, 'tags', t.tags,
    'createdAt', t.created_at, 'updatedAt', t.modified_at,
    'mediaIds', coalesce((select jsonb_agg(l.attachments_id order by l.sort_order, l.id)
      from public.trip_attachments l join public.attachments a on (a.profiles_id,a.id)=(l.profiles_id,l.attachments_id)
      where l.profiles_id=t.profiles_id and l.trips_id=t.id and l.valid and a.valid), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'visitedAt',p.visited_at,'time',to_char(p.visit_time,'HH24:MI'),
      'latitude',p.latitude,'longitude',p.longitude,'description',p.description,'note',p.note,
      'rating',p.rating,'tags',p.tags,
      'mediaIds', coalesce((select jsonb_agg(l.attachments_id order by l.sort_order,l.id)
        from public.place_attachments l join public.attachments a on (a.profiles_id,a.id)=(l.profiles_id,l.attachments_id)
        where l.profiles_id=p.profiles_id and l.trip_places_id=p.id and l.valid and a.valid),'[]'::jsonb)
    ) order by p.sort_order,p.id) from public.trip_places p where p.profiles_id=t.profiles_id and p.trips_id=t.id and p.valid),'[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'type',e.category,'amount',e.amount,'currency',e.currency,'spentAt',e.spent_at,'note',e.note,
      'mediaIds', coalesce((select jsonb_agg(l.attachments_id order by l.sort_order,l.id)
        from public.expense_attachments l join public.attachments a on (a.profiles_id,a.id)=(l.profiles_id,l.attachments_id)
        where l.profiles_id=e.profiles_id and l.expenses_id=e.id and l.valid and a.valid),'[]'::jsonb)
    ) order by e.sort_order,e.id) from public.expenses e where e.profiles_id=t.profiles_id and e.trips_id=t.id and e.valid),'[]'::jsonb)
  ) order by t.created_at,t.id) from public.trips t where t.profiles_id=auth.uid() and t.valid),'[]'::jsonb));
$$;

create or replace function public.roava_write_document(p_document jsonb, p_replace boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t jsonb; p jsonb; e jsonb; m jsonb;
  tid text; pid text; eid text; mid text; jid text;
  n integer; link_order integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_document->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_document->'trips') is distinct from 'array' then
    raise exception 'Invalid TravelDocument';
  end if;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_document->'trips')) then
    raise exception 'Missing or duplicate trip IDs';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  insert into public.profiles(id,users_id,display_name)
    values(uid,uid,coalesce(p_document->'profile'->>'displayName','My Atlas'))
    on conflict(id) do update set valid=true,
      display_name=coalesce(p_document->'profile'->>'displayName',profiles.display_name);
  if p_replace then
    update public.trips set valid=false where profiles_id=uid and valid
      and id not in (select value->>'id' from jsonb_array_elements(p_document->'trips'));
  end if;
  for t in select value from jsonb_array_elements(p_document->'trips') loop
    tid := t->>'id'; jid := nullif(t->>'journeyGroupId','');
    if tid is null or btrim(tid)='' then raise exception 'Trip ID required'; end if;
    if jid is not null then
      insert into public.journeys(id,profiles_id,name) values(jid,uid,jid)
      on conflict(profiles_id,id) do update set valid=true;
    end if;
    insert into public.trips(id,profiles_id,journeys_id,name,country_code,province_code,city_code,city_name,
      start_date,end_date,timezone,description,notes,transport,hotel,restaurant,ticket,route,rating,tags)
    values(tid,uid,jid,t->>'name',t->>'countryCode',t->>'provinceCode',t->>'cityCode',t->>'cityName',
      (t->>'startDate')::date,(t->>'endDate')::date,
      coalesce(nullif(t->>'timezone',''),(select timezone from public.trips where profiles_id=uid and id=tid),
        case when t->>'countryCode'='CN' then 'Asia/Shanghai' else 'Asia/Bangkok' end),
      t->>'description',t->>'notes',t->>'transport',t->>'hotel',t->>'restaurant',t->>'ticket',t->>'route',
      (t->>'rating')::numeric,array(select jsonb_array_elements_text(coalesce(t->'tags','[]'::jsonb))))
    on conflict(profiles_id,id) do update set journeys_id=excluded.journeys_id,name=excluded.name,
      country_code=excluded.country_code,province_code=excluded.province_code,city_code=excluded.city_code,
      city_name=excluded.city_name,start_date=excluded.start_date,end_date=excluded.end_date,
      timezone=excluded.timezone,description=excluded.description,notes=excluded.notes,
      transport=excluded.transport,hotel=excluded.hotel,restaurant=excluded.restaurant,
      ticket=excluded.ticket,route=excluded.route,rating=excluded.rating,tags=excluded.tags,valid=true;

    -- Replacement is scoped to this trip, not the user's entire collection.
    update public.trip_attachments set valid=false where profiles_id=uid and trips_id=tid and valid;
    update public.place_attachments l set valid=false where l.profiles_id=uid and l.valid
      and exists(select 1 from public.trip_places p where p.profiles_id=uid and p.trips_id=tid and p.id=l.trip_places_id);
    update public.expense_attachments l set valid=false where l.profiles_id=uid and l.valid
      and exists(select 1 from public.expenses e where e.profiles_id=uid and e.trips_id=tid and e.id=l.expenses_id);
    update public.trip_places set valid=false where profiles_id=uid and trips_id=tid and valid;
    update public.expenses set valid=false where profiles_id=uid and trips_id=tid and valid;
    n := 0;
    for p in select value from jsonb_array_elements(coalesce(t->'places','[]'::jsonb)) loop
      pid := p->>'id';
      if exists(select 1 from public.trip_places where profiles_id=uid and id=pid and trips_id<>tid) then
        raise exception 'Place ID already belongs to another trip';
      end if;
      insert into public.trip_places(id,profiles_id,trips_id,name,visited_at,visit_time,latitude,longitude,description,note,rating,tags,sort_order)
      values(pid,uid,tid,p->>'name',(p->>'visitedAt')::date,(p->>'time')::time,
        (p->>'latitude')::numeric,(p->>'longitude')::numeric,p->>'description',p->>'note',
        (p->>'rating')::numeric,array(select jsonb_array_elements_text(coalesce(p->'tags','[]'::jsonb))),n)
      on conflict(profiles_id,id) do update set name=excluded.name,visited_at=excluded.visited_at,
        visit_time=excluded.visit_time,latitude=excluded.latitude,longitude=excluded.longitude,
        description=excluded.description,note=excluded.note,rating=excluded.rating,
        tags=excluded.tags,sort_order=excluded.sort_order,valid=true;
      n := n+1; link_order := 0;
      for m in select value from jsonb_array_elements(coalesce(p->'mediaIds','[]'::jsonb)) loop
        mid := m#>>'{}';
        insert into public.attachments(id,profiles_id,type,status) values(mid,uid,'place','missing_metadata')
          on conflict(profiles_id,id) do update set valid=true;
        insert into public.place_attachments(id,profiles_id,trip_places_id,attachments_id,sort_order)
          values(md5('place:'||pid||':'||mid),uid,pid,mid,link_order)
          on conflict(profiles_id,trip_places_id,attachments_id) do update set valid=true,sort_order=excluded.sort_order;
        link_order := link_order+1;
      end loop;
    end loop;
    n := 0;
    for e in select value from jsonb_array_elements(coalesce(t->'expenses','[]'::jsonb)) loop
      eid := e->>'id';
      if exists(select 1 from public.expenses where profiles_id=uid and id=eid and trips_id<>tid) then
        raise exception 'Expense ID already belongs to another trip';
      end if;
      insert into public.expenses(id,profiles_id,trips_id,category,amount,currency,spent_at,note,sort_order)
      values(eid,uid,tid,e->>'type',(e->>'amount')::numeric,e->>'currency',(e->>'spentAt')::date,e->>'note',n)
      on conflict(profiles_id,id) do update set category=excluded.category,amount=excluded.amount,
        currency=excluded.currency,spent_at=excluded.spent_at,note=excluded.note,sort_order=excluded.sort_order,
        exchange_rate=case when expenses.amount=excluded.amount and expenses.currency=excluded.currency then expenses.exchange_rate end,
        base_currency=case when expenses.amount=excluded.amount and expenses.currency=excluded.currency then expenses.base_currency end,
        base_amount=case when expenses.amount=excluded.amount and expenses.currency=excluded.currency then expenses.base_amount end,valid=true;
      n := n+1; link_order := 0;
      for m in select value from jsonb_array_elements(coalesce(e->'mediaIds','[]'::jsonb)) loop
        mid := m#>>'{}';
        insert into public.attachments(id,profiles_id,type,status) values(mid,uid,'expense','missing_metadata')
          on conflict(profiles_id,id) do update set valid=true;
        insert into public.expense_attachments(id,profiles_id,expenses_id,attachments_id,sort_order)
          values(md5('expense:'||eid||':'||mid),uid,eid,mid,link_order)
          on conflict(profiles_id,expenses_id,attachments_id) do update set valid=true,sort_order=excluded.sort_order;
        link_order := link_order+1;
      end loop;
    end loop;
    link_order := 0;
    for m in select value from jsonb_array_elements(coalesce(t->'mediaIds','[]'::jsonb)) loop
      mid := m#>>'{}';
      insert into public.attachments(id,profiles_id,type,status) values(mid,uid,'trip','missing_metadata')
        on conflict(profiles_id,id) do update set valid=true;
      insert into public.trip_attachments(id,profiles_id,trips_id,attachments_id,sort_order)
        values(md5('trip:'||tid||':'||mid),uid,tid,mid,link_order)
        on conflict(profiles_id,trips_id,attachments_id) do update set valid=true,sort_order=excluded.sort_order;
      link_order := link_order+1;
    end loop;
  end loop;
end;
$$;

create or replace function public.roava_archive_trip(p_id text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.trips set valid=false where profiles_id=auth.uid() and id=p_id;
end;
$$;

revoke all on function public.roava_read_document() from public, anon;
revoke all on function public.roava_write_document(jsonb,boolean) from public, anon;
revoke all on function public.roava_archive_trip(text) from public, anon;
grant execute on function public.roava_read_document() to authenticated;
grant execute on function public.roava_write_document(jsonb,boolean) to authenticated;
grant execute on function public.roava_archive_trip(text) to authenticated;

-- Repair grants/policies/triggers too when tables were recreated separately from functions.
do $$
declare t text; ownership_column text;
begin
  foreach t in array array['profiles','journeys','trips','trip_places','expenses',
    'attachments','trip_attachments','place_attachments','expense_attachments'] loop
    ownership_column := case when t='profiles' then 'users_id' else 'profiles_id' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists owner_select on public.%I',t);
    execute format('drop policy if exists owner_insert on public.%I',t);
    execute format('drop policy if exists owner_update on public.%I',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (%I=(select auth.uid()))',t,ownership_column);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (%I=(select auth.uid()))',t,ownership_column);
    execute format('create policy owner_update on public.%I for update to authenticated using (%I=(select auth.uid())) with check (%I=(select auth.uid()))',t,ownership_column,ownership_column);
    execute format('drop trigger if exists roava_audit on public.%I',t);
    execute format('create trigger roava_audit before insert or update on public.%I for each row execute function public.roava_audit_row()',t);
  end loop;
end;
$$;
notify pgrst, 'reload schema';


COMMIT;
