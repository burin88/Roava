-- Roava / Supabase PostgreSQL. Run ONCE in SQL Editor on a new schema.
-- Ownership references an EXISTING Supabase Auth user. No storage objects are moved.
begin;

create table public.profiles (
  id uuid not null default auth.uid(),
  users_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  display_name varchar(150) not null,
  default_currency varchar(3) not null default 'THB' check (default_currency ~ '^[A-Z]{3}$'),
  timezone varchar(64) not null default 'Asia/Bangkok',
  primary key (id),
  unique (users_id),
  check (id = users_id)
);

create table public.journeys (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  name varchar(255) not null,
  description text,
  base_currency varchar(3) not null default 'THB' check (base_currency ~ '^[A-Z]{3}$'),
  primary key (profiles_id, id),
  foreign key (profiles_id) references public.profiles(id)
);

create table public.trips (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  journeys_id varchar(128),
  name varchar(255) not null,
  country_code varchar(2) not null check (country_code ~ '^[A-Z]{2}$'),
  province_code varchar(32),
  city_code varchar(100) not null,
  city_name varchar(150),
  start_date date not null,
  end_date date not null,
  timezone varchar(64) not null default 'Asia/Bangkok',
  description text,
  notes text,
  transport text,
  hotel text,
  restaurant text,
  ticket text,
  route text,
  rating numeric(3,2) check (rating between 0 and 5),
  tags text[] not null default '{}',
  primary key (profiles_id, id),
  foreign key (profiles_id) references public.profiles(id),
  foreign key (profiles_id, journeys_id) references public.journeys(profiles_id, id),
  check (end_date >= start_date)
);

create table public.trip_places (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trips_id varchar(128) not null,
  name varchar(255) not null,
  visited_at date not null,
  visit_time time,
  latitude numeric(10,7) check (latitude between -90 and 90),
  longitude numeric(10,7) check (longitude between -180 and 180),
  description text,
  note text,
  rating numeric(3,2) check (rating between 0 and 5),
  tags text[] not null default '{}',
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (profiles_id, id),
  unique (profiles_id, trips_id, id),
  foreign key (profiles_id, trips_id) references public.trips(profiles_id, id)
);

create table public.expenses (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trips_id varchar(128) not null,
  category varchar(30) not null check (category in ('Transport','Hotel','Restaurant','Ticket','Shopping','Other')),
  amount numeric(19,4) not null,
  currency varchar(3) not null check (currency ~ '^[A-Z]{3}$'),
  spent_at date,
  note text,
  exchange_rate numeric(20,10) check (exchange_rate > 0),
  base_currency varchar(3) check (base_currency ~ '^[A-Z]{3}$'),
  base_amount numeric(19,4),
  primary key (profiles_id, id),
  unique (profiles_id, trips_id, id),
  foreign key (profiles_id, trips_id) references public.trips(profiles_id, id),
  check ((exchange_rate is null and base_currency is null and base_amount is null)
    or (exchange_rate is not null and base_currency is not null and base_amount is not null
      and base_amount = round(amount * exchange_rate, 4)))
);

create table public.attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  type varchar(30) not null check (type in ('trip','place','expense','import')),
  storage_provider varchar(30) not null default 'r2',
  bucket varchar(255),
  path text,
  url text,
  original_filename text,
  mime_type varchar(100),
  size_bytes bigint check (size_bytes >= 0),
  captured_at timestamptz,
  latitude numeric(10,7) check (latitude between -90 and 90),
  longitude numeric(10,7) check (longitude between -180 and 180),
  thumbnail_path text,
  status varchar(30) not null default 'pending'
    check (status in ('pending','ready','failed','missing_metadata')),
  primary key (profiles_id, id),
  foreign key (profiles_id) references public.profiles(id),
  check (status <> 'ready' or (nullif(bucket, '') is not null and nullif(path, '') is not null))
);

create table public.trip_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trips_id varchar(128) not null,
  attachments_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (profiles_id, id),
  unique (profiles_id, trips_id, attachments_id),
  foreign key (profiles_id, trips_id) references public.trips(profiles_id, id),
  foreign key (profiles_id, attachments_id) references public.attachments(profiles_id, id)
);

create table public.place_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trip_places_id varchar(128) not null,
  attachments_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (profiles_id, id),
  unique (profiles_id, trip_places_id, attachments_id),
  foreign key (profiles_id, trip_places_id) references public.trip_places(profiles_id, id),
  foreign key (profiles_id, attachments_id) references public.attachments(profiles_id, id)
);

create table public.expense_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  profiles_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  expenses_id varchar(128) not null,
  attachments_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (profiles_id, id),
  unique (profiles_id, expenses_id, attachments_id),
  foreign key (profiles_id, expenses_id) references public.expenses(profiles_id, id),
  foreign key (profiles_id, attachments_id) references public.attachments(profiles_id, id)
);

create index trips_journeys_idx on public.trips(profiles_id, journeys_id);
create index trip_places_order_idx on public.trip_places(profiles_id, trips_id, sort_order);
create index expenses_date_idx on public.expenses(profiles_id, trips_id, spent_at);
create index trip_attachments_file_idx on public.trip_attachments(profiles_id, attachments_id);
create index place_attachments_file_idx on public.place_attachments(profiles_id, attachments_id);
create index expense_attachments_file_idx on public.expense_attachments(profiles_id, attachments_id);
create index attachments_object_idx on public.attachments(storage_provider, bucket, md5(path));

-- SECURITY INVOKER: no RLS bypass. Authenticated callers cannot forge audit actors.
create function public.roava_audit_row() returns trigger
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

-- Composite keys allow different users to import identical demo IDs.
-- Composite foreign keys prevent links to another user's rows, including via admin imports.
do $$
declare t text; ownership_column text;
begin
  foreach t in array array['profiles','journeys','trips','trip_places','expenses',
    'attachments','trip_attachments','place_attachments','expense_attachments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    ownership_column := case when t='profiles' then 'users_id' else 'profiles_id' end;
    -- Owners can see invalid rows to restore them; UI queries should filter valid = true.
    execute format('create policy owner_select on public.%I for select to authenticated
      using (%I = (select auth.uid()))', t, ownership_column);
    execute format('create policy owner_insert on public.%I for insert to authenticated
      with check (%I = (select auth.uid()))', t, ownership_column);
    execute format('create policy owner_update on public.%I for update to authenticated
      using (%I = (select auth.uid())) with check (%I = (select auth.uid()))', t, ownership_column, ownership_column);
    execute format('create trigger roava_audit before insert or update on public.%I
      for each row execute function public.roava_audit_row()', t);
  end loop;
end;
$$;

comment on column public.attachments.type is 'Upload origin; actual usage is in *_attachments.';
comment on column public.attachments.path is 'Full object key inside bucket; not a filesystem path or signed URL.';
comment on column public.expenses.exchange_rate is '1 currency = exchange_rate base_currency; all conversion columns null when unknown.';
commit;
