import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateImport } from './json-to-postgres.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const moduleUrl = new URL('../tmp/roava-postgres-test/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url);
const schemaUrl = new URL('../database/create-tables.sql', import.meta.url);
const options = { owner, timezone: 'Asia/Shanghai', now: '2026-10-16T00:00:00Z', includeMedia: true };
function fixture() {
  return { schemaVersion: 1, profile: { displayName: "ไทย's Atlas \\" }, trips: [{
    id: 'demo:beijing', journeyGroupId: 'demo', name: 'Beijing', countryCode: 'CN', cityCode: 'BEIJING',
    startDate: '2026-10-29', endDate: '2026-11-04', createdAt: '2026-10-15T11:23:38.152Z',
    mediaIds: ['photo-1'], places: [{ id: 'stop:1', name: 'Temple', visitedAt: '2026-10-29',
      time: '08:30', mediaIds: ['photo-1'] }], expenses: [{ id: 'expense:1', type: 'Hotel',
      amount: 12812.748, currency: 'THB', note: "'); DROP TABLE public.trips; --", mediaIds: ['photo-1'] }],
  }] };
}
async function database(schema = schemaUrl) {
  const { PGlite } = await import(moduleUrl.href);
  const db = new PGlite();
  // Minimal local equivalents of Supabase's managed Auth schema and roles.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${owner}'), ('${other}');`);
  await db.exec(await readFile(schema, 'utf8'));
  return db;
}
async function scalar(db, sql) { return Object.values((await db.query(sql)).rows[0])[0]; }
async function assertForeignKeyNames(db) {
  const mismatches = await scalar(db, `select count(*)::int from pg_constraint c
    join pg_class master on master.oid=c.confrelid
    join lateral unnest(c.conkey,c.confkey) as pair(local_key,master_key) on true
    join pg_attribute local_column on local_column.attrelid=c.conrelid and local_column.attnum=pair.local_key
    join pg_attribute master_column on master_column.attrelid=c.confrelid and master_column.attnum=pair.master_key
    where c.contype='f' and c.connamespace='public'::regnamespace
      and master_column.attname='id' and local_column.attname<>master.relname||'_id'`);
  assert.equal(mismatches,0,'Every master ID reference must use {ref_table}_id');
}
async function login(db, id) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
}
async function admin(db) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
}

test('PostgreSQL executes DDL, imports, constraints, audit and RLS', async () => {
  const db = await database();
  try {
    const generated = generateImport(fixture(), options);
    await db.exec(generated.sql);
    await db.exec(generated.sql);
    assert.equal(await scalar(db, 'select count(*)::int from public.attachments'), 1);
    assert.equal(await scalar(db, 'select amount::text from public.expenses'), '12812.7480');
    assert.equal(await scalar(db, 'select note from public.expenses'), "'); DROP TABLE public.trips; --");
    assert.equal(await scalar(db, 'select display_name from public.profiles'), "ไทย's Atlas \\");
    assert.equal(await scalar(db, "select created_at = '2026-10-15T11:23:38.152Z'::timestamptz from public.trips"), true);
    assert.equal(await scalar(db, "select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relkind='r' and relrowsecurity"), 9);
    await assertForeignKeyNames(db);

    // Identical legacy IDs can belong to another account without conflict.
    await db.exec(generateImport(fixture(), { ...options, owner: other }).sql);
    await login(db, owner);
    for (const table of Object.keys(generated.counts)) {
      assert.equal(await scalar(db, `select count(*)::int from public.${table}`), 1, table);
      const ownershipColumn = table === 'profiles' ? 'users_id' : 'profiles_id';
      assert.equal(await scalar(db, `select count(*)::int from public.${table} where ${ownershipColumn}='${other}'`), 0, table);
    }
    assert.equal(await scalar(db, `with changed as (update public.trips set name='forbidden' where profiles_id='${other}' returning *) select count(*)::int from changed`), 0);
    await assert.rejects(db.exec(`insert into public.journeys(id, profiles_id, name) values ('bad','${other}','bad')`));
    await assert.rejects(db.exec("delete from public.trips where id='demo:beijing'"));
    await assert.rejects(db.exec(`update public.trips set profiles_id='${other}' where id='demo:beijing'`));
    await db.exec("update public.trips set valid=false, created_by='fake', modified_by='fake' where id='demo:beijing'");
    assert.equal(await scalar(db, 'select modified_by from public.trips'), owner);
    assert.equal(await scalar(db, 'select created_by from public.trips'), owner);
    await db.exec("update public.trips set valid=true where id='demo:beijing'");
    await admin(db);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.trips'));
    await admin(db);

    // Composite FK blocks cross-account references even for privileged imports.
    await db.exec(`insert into public.attachments(id,profiles_id,type,created_by,modified_by)
      values ('only-other','${other}','trip','admin','admin')`);
    await assert.rejects(db.exec(`insert into public.trip_attachments(id,profiles_id,trips_id,attachments_id,created_by,modified_by)
      values ('bad-link','${owner}','demo:beijing','only-other','admin','admin')`));
    await assert.rejects(db.exec(`update public.attachments set status='ready' where id='photo-1'`));

    await db.exec(generateImport(fixture(), { ...options, upsert: true, bucket: 'real',
      media: [{ id: 'photo-1', key: 'roava/media/real.jpg' }] }).sql);
    await db.exec(generateImport(fixture(), { ...options, upsert: true }).sql);
    assert.equal(await scalar(db, `select path from public.attachments where profiles_id='${owner}'`), 'roava/media/real.jpg');
    assert.equal(await scalar(db, `select status from public.attachments where profiles_id='${owner}'`), 'ready');

    const broken = fixture(); broken.trips[0].places[0].id = 'x'.repeat(129);
    assert.throws(() => generateImport(broken, options));
  } finally { await db.close(); }
});

test('pasted JSON INSERT SQL executes and can be repeated without duplicates', async (t) => {
  const source = await readFile(new URL('../database/import-pasted-json.sql', import.meta.url), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (source === null) { t.skip('Private local import file is not included in the repository'); return; }
  const db = await database();
  try {
    const configuredOwner = source.match(/WHERE id = '([0-9a-f-]{36})'::uuid/i)?.[1];
    assert.ok(configuredOwner, 'Import must have an explicit owner UUID');
    const sql = source.replaceAll(configuredOwner, owner);
    await db.exec(sql);
    await db.exec(sql);
    const expected = { profiles: 1, journeys: 1, trips: 2, trip_places: 45, expenses: 4,
      attachments: 0, trip_attachments: 0, place_attachments: 0, expense_attachments: 0 };
    for (const [table, count] of Object.entries(expected)) {
      assert.equal(await scalar(db, `select count(*)::int from public.${table}`), count, table);
    }
    assert.equal(await scalar(db, "select count(*)::int from public.attachments where status='missing_metadata'"), 0);
    assert.equal(await scalar(db, 'select sum(amount)::text from public.expenses'), '29559.5160');
  } finally { await db.close(); }
});

test('application RPCs round-trip, replace children atomically, archive and enforce ownership', async () => {
  const db = await database();
  try {
    // Recreated tables can coexist with the previous audit function after a manual rebuild.
    const legacy = await readFile(new URL('./fixtures/legacy-owner-schema.sql', import.meta.url), 'utf8');
    const auditStart = legacy.indexOf('create function public.roava_audit_row()');
    const auditEnd = legacy.indexOf('revoke all on function public.roava_audit_row()', auditStart);
    await db.exec(legacy.slice(auditStart,auditEnd).replace('create function','create or replace function'));
    await db.exec('drop policy owner_insert on public.profiles; drop trigger roava_audit on public.profiles;');
    await db.exec(await readFile(new URL('../database/connect-app.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../database/connect-app.sql', import.meta.url), 'utf8'));
    await login(db, owner);
    const write = (doc, replace = false) => db.query('select public.roava_write_document($1::jsonb,$2)', [JSON.stringify(doc), replace]);
    const read = async () => (await db.query('select public.roava_read_document() as doc')).rows[0].doc;
    await write(fixture());
    let doc = await read();
    assert.equal(doc.trips.length, 1);
    assert.equal(doc.trips[0].expenses[0].amount, 12812.748);
    assert.deepEqual(doc.trips[0].places[0].mediaIds, ['photo-1']);
    assert.equal(doc.trips[0].places[0].time, '08:30');
    assert.equal(doc.trips[0].timezone, 'Asia/Shanghai');
    await write(doc);
    assert.equal(await scalar(db, 'select count(*)::int from public.attachments'), 1);
    const invalid = structuredClone(doc); invalid.trips[0].name='MUST ROLLBACK'; invalid.trips[0].expenses[0].currency='BADCODE';
    await assert.rejects(write(invalid));
    assert.notEqual((await read()).trips[0].name, 'MUST ROLLBACK');
    doc.trips[0].expenses=[]; doc.trips[0].places=[]; doc.trips[0].mediaIds=[];
    await write(doc);
    assert.deepEqual((await read()).trips[0].expenses, []);
    assert.equal(await scalar(db, 'select count(*)::int from public.expense_attachments where valid'), 0);
    await login(db, other);
    assert.equal((await read()).trips.length, 0);
    await db.query('select public.roava_archive_trip($1)', ['demo:beijing']);
    await write(fixture());
    await login(db, owner);
    assert.equal((await read()).trips[0].expenses.length, 0);
    await write({schemaVersion:1,trips:[]}, true);
    assert.equal((await read()).trips.length, 0);
    await login(db, other);
    assert.equal((await read()).trips.length, 1);
    await admin(db); await db.exec('set role anon');
    await assert.rejects(db.query('select public.roava_write_document($1::jsonb,false)', [JSON.stringify(fixture())]));
  } finally { await db.close(); }
});

test('existing ownership schema upgrades without changing data, and can be rerun', async () => {
  const db = await database(new URL('./fixtures/legacy-owner-schema.sql', import.meta.url));
  try {
    let oldImport = generateImport(fixture(), options).sql;
    for (const [modern, legacy] of Object.entries({ users_id:'owner_id', profiles_id:'owner_id',
      journeys_id:'journey_id', trips_id:'trip_id', trip_places_id:'place_id', expenses_id:'expense_id', attachments_id:'attachment_id' })) {
      oldImport = oldImport.replaceAll(modern, legacy);
    }
    oldImport = oldImport.split('\n').map(line => line.startsWith('INSERT INTO public.profiles ')
      ? line.replace('ON CONFLICT (id)', 'ON CONFLICT (owner_id, id)') : line).join('\n');
    await db.exec(oldImport);
    const before = (await db.query('select id, name, created_at, modified_at from public.trips')).rows;
    const upgrade = await readFile(new URL('../database/rename-owner-columns.sql', import.meta.url), 'utf8');
    await db.exec(upgrade);
    await db.exec(upgrade);
    await assertForeignKeyNames(db);
    assert.deepEqual((await db.query('select id, name, created_at, modified_at from public.trips')).rows, before);
    assert.equal(await scalar(db, "select count(*)::int from information_schema.columns where table_schema='public' and column_name='owner_id'"), 0);
    assert.equal(await scalar(db, "select data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id'"), 'uuid');
    const keys = (await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.attachments'::regclass and contype='f'")).rows;
    assert.ok(keys.some(k => k.definition === 'FOREIGN KEY (profiles_id) REFERENCES profiles(id)'));
    await db.exec(generateImport(fixture(), options).sql);
    await login(db, owner);
    const doc = await scalar(db, 'select public.roava_read_document()');
    assert.equal(doc.trips[0].expenses[0].amount,12812.748);
    assert.deepEqual(doc.trips[0].mediaIds,['photo-1']);
    await db.query('select public.roava_write_document($1::jsonb,false)', [JSON.stringify(doc)]);
    await login(db, other);
    assert.equal((await scalar(db, 'select public.roava_read_document()')).trips.length,0);
  } finally { await db.close(); }
});
