import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const tables = ['profiles', 'journeys', 'trips', 'trip_places', 'expenses', 'attachments',
  'trip_attachments', 'place_attachments', 'expense_attachments'];
const categories = ['Transport', 'Hotel', 'Restaurant', 'Ticket', 'Shopping', 'Other'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assert(ok, message) { if (!ok) throw new Error(message); }
function text(value, label, max = Infinity) {
  assert(typeof value === 'string' && value.trim() && value.length <= max && !value.includes('\0'), `Invalid ${label}`);
  return value;
}
function optional(value, label, max = Infinity) {
  return value == null ? null : text(value, label, max);
}
function nullableText(value, label) {
  if (value == null) return null;
  assert(typeof value === 'string' && !value.includes('\0'), `Invalid ${label}`);
  return value;
}
function date(value, label, nullable = false) {
  if (value == null && nullable) return null;
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `Invalid ${label}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  assert(Number.isFinite(+d) && d.toISOString().slice(0, 10) === value, `Invalid ${label}`);
  return value;
}
function timestamp(value, label) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value), `Invalid ${label}: timezone required`);
  date(value.slice(0, 10), label);
  assert(Number.isFinite(Date.parse(value)), `Invalid ${label}`);
  return new Date(value).toISOString();
}
function number(value, label, min, max) {
  if (value == null) return null;
  assert(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `Invalid ${label}`);
  return value;
}
function array(value, label) {
  if (value == null) return [];
  assert(Array.isArray(value), `Invalid ${label}: expected array`);
  return value;
}
function tags(value) { return array(value, 'tags').map(v => text(v, 'tag')); }
function mediaIds(value) {
  const ids = array(value, 'mediaIds').map(v => text(v, 'media ID', 128));
  assert(new Set(ids).size === ids.length, 'Duplicate media ID in one entity');
  return ids;
}
function currency(value) {
  assert(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'Currency must be a three-letter uppercase code');
  return value;
}
function timezone(value) {
  text(value, 'timezone', 64);
  new Intl.DateTimeFormat('en', { timeZone: value }).format();
  return value;
}
// Always SQL-escape data, including apostrophes and backslashes. Identifiers are constants only.
function literal(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `ARRAY[${value.map(literal).join(', ')}]::text[]`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Offline JSON -> transactional INSERT SQL. Never opens a network connection. */
export function generateImport(document, options) {
  assert(document?.schemaVersion === 1 && Array.isArray(document.trips), 'Expected TravelDocument schemaVersion 1 with trips[]');
  assert(uuid.test(options.owner ?? ''), '--owner must be an existing Supabase Auth user UUID');
  const owner = options.owner.toLowerCase();
  const now = timestamp(options.now ?? new Date().toISOString(), 'import time');
  const defaultCurrency = currency(options.currency ?? 'THB');
  // Old exports contain no timezone. Do not silently assume the timezone of the importing machine.
  const defaultTimezone = options.timezone ? timezone(options.timezone) : null;
  const rows = Object.fromEntries(tables.map(t => [t, new Map()]));
  const warnings = [];
  function base(id, createdAt = now, modifiedAt = createdAt) {
    return { id: text(id, 'id', 128), profiles_id: owner, created_at: createdAt,
      created_by: owner, modified_at: modifiedAt, modified_by: owner, valid: true };
  }
  function put(table, row) {
    if (table === 'profiles') { row = { ...row, users_id: row.profiles_id }; delete row.profiles_id; }
    assert(!rows[table].has(row.id), `Duplicate ${table} ID: ${row.id}`);
    rows[table].set(row.id, row);
  }
  put('profiles', { ...base(owner), display_name: text(document.profile?.displayName ?? 'My Atlas', 'displayName', 150),
    default_currency: defaultCurrency, timezone: timezone(options.profileTimezone ?? 'Asia/Bangkok') });
  const references = new Map();
  function link(kind, entityId, ids, createdAt) {
    // Backups can reference images that were never copied to R2. Skip them by default.
    if (!options.includeMedia) return;
    mediaIds(ids).forEach((id, index) => {
      const use = references.get(id) ?? new Set();
      use.add(kind);
      references.set(id, use);
      const table = `${kind}_attachments`;
      // Fixed-length deterministic IDs ensure repeated runs have the same identities.
      const linkId = createHash('sha256').update(JSON.stringify([kind, entityId, id])).digest('hex');
      const referenceColumn = { trip: 'trips_id', place: 'trip_places_id', expense: 'expenses_id' }[kind];
      put(table, { ...base(linkId, createdAt), [referenceColumn]: entityId,
        attachments_id: id, sort_order: index, caption: null });
    });
  }
  for (const trip of document.trips) {
    const id = text(trip.id, 'trip.id', 128);
    const createdAt = trip.createdAt == null ? now : timestamp(trip.createdAt, 'createdAt');
    const modifiedAt = trip.updatedAt == null ? createdAt : timestamp(trip.updatedAt, 'updatedAt');
    const journeyId = optional(trip.journeyGroupId, 'journeyGroupId', 128);
    if (journeyId && !rows.journeys.has(journeyId)) {
      // Export has a group ID but no group name. Preserve the ID as the initial editable name.
      put('journeys', { ...base(journeyId, createdAt), name: journeyId,
        description: null, base_currency: defaultCurrency });
    }
    const start = date(trip.startDate, 'startDate');
    const end = date(trip.endDate, 'endDate');
    assert(end >= start, `Trip ${id}: endDate precedes startDate`);
    assert(/^[A-Z]{2}$/.test(trip.countryCode ?? ''), 'Invalid countryCode');
    const tz = trip.timezone ? timezone(trip.timezone) : defaultTimezone;
    assert(tz, `Trip ${id} has no timezone; pass --timezone (for this China export: Asia/Shanghai)`);
    put('trips', { ...base(id, createdAt, modifiedAt), journeys_id: journeyId,
      name: text(trip.name, 'trip.name', 255), country_code: trip.countryCode,
      province_code: optional(trip.provinceCode, 'provinceCode', 32),
      city_code: text(trip.cityCode, 'cityCode', 100), city_name: optional(trip.cityName, 'cityName', 150),
      start_date: start, end_date: end, timezone: tz,
      ...Object.fromEntries(['description', 'notes', 'transport', 'hotel', 'restaurant', 'ticket', 'route']
        .map(k => [k, nullableText(trip[k], k)])),
      rating: number(trip.rating, 'rating', 0, 5), tags: tags(trip.tags) });
    link('trip', id, trip.mediaIds, createdAt);
    array(trip.places, 'places').forEach((place, index) => {
      const placeId = text(place.id, 'place.id', 128);
      assert(place.time == null || /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(place.time), 'Invalid place.time');
      put('trip_places', { ...base(placeId, createdAt), trips_id: id,
        name: text(place.name, 'place.name', 255), visited_at: date(place.visitedAt, 'visitedAt'),
        visit_time: place.time ?? null, latitude: number(place.latitude, 'latitude', -90, 90),
        longitude: number(place.longitude, 'longitude', -180, 180),
        description: nullableText(place.description, 'description'), note: nullableText(place.note, 'note'),
        rating: number(place.rating, 'rating', 0, 5), tags: tags(place.tags), sort_order: index });
      link('place', placeId, place.mediaIds, createdAt);
    });
    array(trip.expenses, 'expenses').forEach(expense => {
      assert(categories.includes(expense.type), `Invalid expense type: ${expense.type}`);
      const amount = number(expense.amount, 'amount', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      assert(amount !== null && /^-?\d+(?:\.\d{1,4})?$/.test(String(amount))
        && Math.abs(amount) < 1e15, 'Expense amount must fit numeric(19,4) without rounding');
      const expenseId = text(expense.id, 'expense.id', 128);
      put('expenses', { ...base(expenseId, createdAt), trips_id: id, category: expense.type,
        amount, currency: currency(expense.currency), spent_at: date(expense.spentAt, 'spentAt', true),
        note: nullableText(expense.note, 'note') });
      link('expense', expenseId, expense.mediaIds, createdAt);
    });
  }
  const sourceMedia = options.media ?? [];
  assert(sourceMedia && typeof sourceMedia === 'object', 'Invalid media manifest');
  const records = Array.isArray(sourceMedia) ? sourceMedia : Object.entries(sourceMedia).map(([id, r]) => ({ ...r, id: r.id ?? id }));
  const metadata = new Map();
  for (const r of records) {
    text(r.id, 'metadata.id', 128);
    assert(!metadata.has(r.id), `Duplicate media metadata: ${r.id}`);
    metadata.set(r.id, r);
  }
  for (const [id, uses] of references) {
    const record = metadata.get(id);
    // A media ID alone cannot reveal an R2 key, upload month, extension, or bucket.
    const bucket = optional(record?.bucket ?? options.bucket, 'bucket', 255);
    const path = optional(record?.path ?? record?.key, 'path');
    const ready = !!(bucket && path);
    if (!ready) warnings.push(`Attachment ${id}: missing bucket/path; status=missing_metadata`);
    const size = record?.size_bytes ?? record?.size;
    if (size != null) assert(Number.isSafeInteger(size) && size >= 0, 'Invalid media size');
    put('attachments', { ...base(id), type: record?.type ?? (uses.has('expense') ? 'expense' : uses.has('place') ? 'place' : 'trip'),
      storage_provider: text(record?.storage_provider ?? 'r2', 'storage_provider', 30), bucket, path,
      url: nullableText(record?.url, 'url'), original_filename: nullableText(record?.original_filename ?? record?.fileName, 'fileName'),
      mime_type: optional(record?.mime_type ?? record?.contentType, 'mime_type', 100), size_bytes: size ?? null,
      captured_at: record?.capturedAt ? timestamp(record.capturedAt, 'capturedAt') : null,
      latitude: number(record?.latitude, 'latitude', -90, 90), longitude: number(record?.longitude, 'longitude', -180, 180),
      thumbnail_path: optional(record?.thumbnail_path, 'thumbnail_path'), status: ready ? 'ready' : 'missing_metadata' });
    assert(['trip', 'place', 'expense', 'import'].includes(rows.attachments.get(id).type), 'Invalid attachment type');
  }
  const sql = ['-- Generated by scripts/json-to-postgres.mjs. Review before execution.',
    ...(!options.includeMedia ? ['-- mediaIds are ignored; no attachments or media links are imported.'] : []),
    ...(owner === '00000000-0000-0000-0000-000000000000'
      ? ['-- REQUIRED: replace ALL 00000000-0000-0000-0000-000000000000 with your existing Supabase Auth User UID.'] : []),
    '-- Additive import: absent source rows are NEVER deleted.', 'BEGIN;', 'SET LOCAL standard_conforming_strings = on;',
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = ${literal(owner)}::uuid) THEN`,
    "RAISE EXCEPTION 'Import owner does not exist in auth.users'; END IF; END $$;"];
  for (const table of tables) {
    for (const row of rows[table].values()) {
      const columns = Object.keys(row);
      let conflict = 'DO NOTHING';
      if (options.upsert) {
        const updates = columns.filter(c => !['users_id', 'profiles_id', 'id', 'created_at', 'created_by'].includes(c))
          // Never replace known file metadata with a placeholder on later JSON-only imports.
          .filter(c => !(table === 'attachments' && row.status === 'missing_metadata'
            && !['modified_at', 'modified_by', 'valid'].includes(c)))
          .map(c => `${c} = EXCLUDED.${c}`);
        conflict = `DO UPDATE SET ${updates.join(', ')}`;
      }
      const ownershipColumn = table === 'profiles' ? 'users_id' : 'profiles_id';
      const conflictColumns = table === 'profiles' ? 'id' : `${ownershipColumn}, id`;
      sql.push(`INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${columns.map(c => literal(row[c])).join(', ')}) ON CONFLICT (${conflictColumns}) ${conflict};`);
    }
  }
  sql.push('COMMIT;', '');
  return { sql: sql.join('\n'), warnings, counts: Object.fromEntries(tables.map(t => [t, rows[t].size])) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node scripts/json-to-postgres.mjs --input export.json --owner AUTH_USER_UUID --timezone Asia/Shanghai --output database/import.sql [--include-media --media media.json --bucket BUCKET] [--currency THB] [--profile-timezone Asia/Bangkok] [--upsert]');
    return;
  }
  const options = {};
  const allowed = ['input', 'owner', 'output', 'media', 'bucket', 'currency', 'timezone', 'profile-timezone'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--upsert') { options.upsert = true; continue; }
    if (args[i] === '--include-media') { options.includeMedia = true; continue; }
    const key = args[i].replace(/^--/, '');
    assert(args[i].startsWith('--') && allowed.includes(key) && args[i + 1] && !args[i + 1].startsWith('--'), `Unknown or incomplete argument: ${args[i]}`);
    assert(!(key in options), `Repeated argument: ${args[i]}`);
    options[key] = args[++i];
  }
  assert(options.input && options.output, '--input and --output are required');
  const { resolve } = await import('node:path');
  assert(resolve(options.input) !== resolve(options.output)
    && (!options.media || resolve(options.media) !== resolve(options.output)), 'Output must not overwrite an input file');
  const document = JSON.parse((await readFile(options.input, 'utf8')).replace(/^\uFEFF/, ''));
  const media = options.media ? JSON.parse((await readFile(options.media, 'utf8')).replace(/^\uFEFF/, '')) : [];
  const result = generateImport(document, { ...options, media, profileTimezone: options['profile-timezone'] });
  await writeFile(options.output, result.sql, 'utf8');
  console.log(JSON.stringify({ output: options.output, counts: result.counts }, null, 2));
  result.warnings.forEach(w => console.warn(w));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
