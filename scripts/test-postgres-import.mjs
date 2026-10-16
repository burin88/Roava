import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImport } from './json-to-postgres.mjs';

export const owner = '11111111-1111-4111-8111-111111111111';
export const other = '22222222-2222-4222-8222-222222222222';
export const options = { owner, timezone: 'Asia/Shanghai', now: '2026-10-16T00:00:00Z', includeMedia: true };
export function fixture() {
  return { schemaVersion: 1, profile: { displayName: "My Atlas ' 中文 ไทย \\" }, trips: [{
    id: 'demo:beijing', journeyGroupId: 'demo', name: "Beijing's trip", countryCode: 'CN',
    cityCode: 'BEIJING', startDate: '2026-10-29', endDate: '2026-11-04',
    createdAt: '2026-10-15T11:23:38.152Z', updatedAt: '2026-10-16T00:30:53.465Z',
    tags: ['itinerary'], mediaIds: ['photo-1'], places: [{ id: 'stop:1', name: 'Temple',
      visitedAt: '2026-10-29', time: '08:30', mediaIds: ['photo-1'] }],
    expenses: [{ id: 'expense:1', type: 'Hotel', amount: 12812.748, currency: 'THB',
      note: "'); DROP TABLE public.trips; --", mediaIds: ['photo-1'] }],
  }] };
}

test('preserves IDs, decimals, Unicode, references and audit timestamps; escapes SQL', () => {
  const result = generateImport(fixture(), options);
  assert.deepEqual(result.counts, { profiles: 1, journeys: 1, trips: 1, trip_places: 1,
    expenses: 1, attachments: 1, trip_attachments: 1, place_attachments: 1, expense_attachments: 1 });
  assert.match(result.sql, /12812\.748/);
  assert.match(result.sql, /中文 ไทย/);
  assert.match(result.sql, /Beijing''s trip/);
  assert.match(result.sql, /''\); DROP TABLE public.trips; --/);
  assert.match(result.sql, /2026-10-15T11:23:38.152Z/);
  assert.match(result.sql, /missing_metadata/);
  assert.equal(result.warnings.length, 1);
});

test('default migration ignores trip, place and expense mediaIds', () => {
  const result = generateImport(fixture(), { ...options, includeMedia: false });
  for (const table of ['attachments','trip_attachments','place_attachments','expense_attachments']) {
    assert.equal(result.counts[table],0);
    assert.ok(!result.sql.includes(`INSERT INTO public.${table} `));
  }
  assert.ok(!result.sql.includes('photo-1'));
  assert.equal(result.counts.expenses,1);
  assert.equal(result.warnings.length,0);
});

test('repeat import identities are stable; upsert does not erase known metadata', () => {
  assert.equal(generateImport(fixture(), options).sql, generateImport(fixture(), options).sql);
  const result = generateImport(fixture(), { ...options, upsert: true });
  const attachmentSql = result.sql.split('\n').find(s => s.startsWith('INSERT INTO public.attachments'));
  assert.match(attachmentSql, /DO UPDATE/);
  assert.doesNotMatch(attachmentSql.split('DO UPDATE')[1], /path =|status =|type =/);
  assert.doesNotMatch(result.sql, /DELETE FROM/);
});

test('uses real manifest key, deduplicates shared file and never guesses a path', () => {
  const result = generateImport(fixture(), { ...options, bucket: 'real-bucket',
    media: [{ id: 'photo-1', key: 'roava/media/2026/10/real.jpg', size: 12, contentType: 'image/jpeg' }] });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.counts.attachments, 1);
  assert.match(result.sql, /'expense', 'r2', 'real-bucket', 'roava\/media\/2026\/10\/real.jpg'/);
  assert.match(result.sql, /'ready'/);
});

test('validates inputs before producing SQL', () => {
  assert.throws(() => generateImport(fixture(), { ...options, owner: "x'; DROP" }), /owner/);
  assert.throws(() => generateImport(fixture(), { owner }), /timezone/);
  for (const mutate of [
    d => { d.trips[0].startDate = '2026-02-30'; },
    d => { d.trips[0].expenses[0].amount = 1.23456; },
    d => { d.trips[0].expenses[0].amount = null; },
    d => { d.trips[0].places[0].latitude = 91; },
    d => { d.trips.push(structuredClone(d.trips[0])); },
    d => { d.trips[0].mediaIds.push('photo-1'); },
    d => { d.trips[0].places[0].time = '25:01'; },
  ]) {
    const d = fixture(); mutate(d);
    assert.throws(() => generateImport(d, options));
  }
});
