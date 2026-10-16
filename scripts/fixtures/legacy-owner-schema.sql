-- Roava / Supabase PostgreSQL. Run ONCE in SQL Editor on a new schema.
-- Ownership references an EXISTING Supabase Auth user. No storage objects are moved.
begin;

create table public.profiles (
  id varchar(128) not null default auth.uid()::text,
  owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  display_name varchar(150) not null,
  default_currency varchar(3) not null default 'THB' check (default_currency ~ '^[A-Z]{3}$'),
  timezone varchar(64) not null default 'Asia/Bangkok',
  primary key (owner_id, id),
  unique (owner_id),
  check (id = owner_id::text)
);

create table public.journeys (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  name varchar(255) not null,
  description text,
  base_currency varchar(3) not null default 'THB' check (base_currency ~ '^[A-Z]{3}$'),
  primary key (owner_id, id),
  foreign key (owner_id) references public.profiles(owner_id)
);

create table public.trips (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  journey_id varchar(128),
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
  primary key (owner_id, id),
  foreign key (owner_id) references public.profiles(owner_id),
  foreign key (owner_id, journey_id) references public.journeys(owner_id, id),
  check (end_date >= start_date)
);

create table public.trip_places (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trip_id varchar(128) not null,
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
  primary key (owner_id, id),
  unique (owner_id, trip_id, id),
  foreign key (owner_id, trip_id) references public.trips(owner_id, id)
);

create table public.expenses (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trip_id varchar(128) not null,
  category varchar(30) not null check (category in ('Transport','Hotel','Restaurant','Ticket','Shopping','Other')),
  amount numeric(19,4) not null,
  currency varchar(3) not null check (currency ~ '^[A-Z]{3}$'),
  spent_at date,
  note text,
  exchange_rate numeric(20,10) check (exchange_rate > 0),
  base_currency varchar(3) check (base_currency ~ '^[A-Z]{3}$'),
  base_amount numeric(19,4),
  primary key (owner_id, id),
  unique (owner_id, trip_id, id),
  foreign key (owner_id, trip_id) references public.trips(owner_id, id),
  check ((exchange_rate is null and base_currency is null and base_amount is null)
    or (exchange_rate is not null and base_currency is not null and base_amount is not null
      and base_amount = round(amount * exchange_rate, 4)))
);

create table public.attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
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
  primary key (owner_id, id),
  foreign key (owner_id) references public.profiles(owner_id),
  check (status <> 'ready' or (nullif(bucket, '') is not null and nullif(path, '') is not null))
);

create table public.trip_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  trip_id varchar(128) not null,
  attachment_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (owner_id, id),
  unique (owner_id, trip_id, attachment_id),
  foreign key (owner_id, trip_id) references public.trips(owner_id, id),
  foreign key (owner_id, attachment_id) references public.attachments(owner_id, id)
);

create table public.place_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  place_id varchar(128) not null,
  attachment_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (owner_id, id),
  unique (owner_id, place_id, attachment_id),
  foreign key (owner_id, place_id) references public.trip_places(owner_id, id),
  foreign key (owner_id, attachment_id) references public.attachments(owner_id, id)
);

create table public.expense_attachments (
  id varchar(128) not null default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  created_by varchar(128) not null default auth.uid()::text,
  modified_at timestamptz not null default now(),
  modified_by varchar(128) not null default auth.uid()::text,
  valid boolean not null default true,
  expense_id varchar(128) not null,
  attachment_id varchar(128) not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  primary key (owner_id, id),
  unique (owner_id, expense_id, attachment_id),
  foreign key (owner_id, expense_id) references public.expenses(owner_id, id),
  foreign key (owner_id, attachment_id) references public.attachments(owner_id, id)
);

create index trips_journey_idx on public.trips(owner_id, journey_id);
create index trip_places_order_idx on public.trip_places(owner_id, trip_id, sort_order);
create index expenses_date_idx on public.expenses(owner_id, trip_id, spent_at);
create index trip_attachments_file_idx on public.trip_attachments(owner_id, attachment_id);
create index place_attachments_file_idx on public.place_attachments(owner_id, attachment_id);
create index expense_attachments_file_idx on public.expense_attachments(owner_id, attachment_id);
create index attachments_object_idx on public.attachments(storage_provider, bucket, md5(path));

-- SECURITY INVOKER: no RLS bypass. Authenticated callers cannot forge audit actors.
create function public.roava_audit_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
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
declare t text;
begin
  foreach t in array array['profiles','journeys','trips','trip_places','expenses',
    'attachments','trip_attachments','place_attachments','expense_attachments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    -- Owners can see invalid rows to restore them; UI queries should filter valid = true.
    execute format('create policy owner_select on public.%I for select to authenticated
      using (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated
      with check (owner_id = (select auth.uid()))', t);
    execute format('create policy owner_update on public.%I for update to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create trigger roava_audit before insert or update on public.%I
      for each row execute function public.roava_audit_row()', t);
  end loop;
end;
$$;

comment on column public.attachments.type is 'Upload origin; actual usage is in *_attachments.';
comment on column public.attachments.path is 'Full object key inside bucket; not a filesystem path or signed URL.';
comment on column public.expenses.exchange_rate is '1 currency = exchange_rate base_currency; all conversion columns null when unknown.';
commit;
