import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { startMediaServer } from '../server/media-server.mjs';
import { R2BindingStorageService } from '../server/services/r2-binding-storage.service.mjs';
import { MediaStorageService } from '../server/services/media-storage.service.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { supabaseFixture, fetchWithAuth as fetch, testAuth, testEnv } from './fixtures/supabase-api.mjs';
const api = supabaseFixture();

function bucketFixture({ failMetadata = false } = {}) {
  const objects = new Map();
  return {
    objects,
    async put(key, body, metadata) {
      if (failMetadata && key.includes('/records/')) throw new Error('simulated metadata failure');
      const bytes = new Uint8Array(body);
      objects.set(key, { bytes, ...metadata });
      return { httpEtag: '"test-etag"' };
    },
    async get(key) {
      const value = objects.get(key);
      return value ? { ...value, body: new Blob([value.bytes]).stream(), size: value.bytes.length, httpEtag: '"test-etag"' } : null;
    },
    async delete(key) { objects.delete(key); },
    async list({ prefix, cursor }) {
      // Force small pages to exercise pagination while deleting objects.
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
      return { objects: keys.slice(0, 2).map(key => ({ key })), truncated: keys.length > 2, cursor: keys[1] };
    },
  };
}

async function withServer(bucket, run) {
  const server = await startMediaServer(0, () => new R2BindingStorageService(bucket), api);
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

const photo = () => new File([new Uint8Array([0, 255, 12, 42])], 'ใบเสร็จ.jpg', { type: 'image/jpeg', lastModified: Date.parse('2026-10-15') });
const upload = (base, file = photo()) => fetch(`${base}/api/media`, {
  method: 'POST', body: file,
  headers: {
    'content-type': file.type, 'x-file-name': encodeURIComponent(file.name),
    'x-trip-id': encodeURIComponent('ทริปเที่ยว'), 'x-place-id': 'place',
    'x-file-captured-at': new Date(file.lastModified).toISOString(),
  },
});

test('Node media API stores originals and metadata in R2 and reads them after a server restart', async () => {
  const bucket = bucketFixture();
  let saved;
  await withServer(bucket, async base => {
    const response = await upload(base);
    assert.equal(response.status, 201);
    saved = await response.json();
    assert.match(saved.key, /^roava\/media\/\d{4}\/\d{2}\/[a-f0-9-]+\.jpg$/);
    assert.equal(saved.fileName, 'ใบเสร็จ.jpg');
    assert.equal(saved.tripId, 'ทริปเที่ยว');
    assert.equal(saved.placeId, 'place');
    assert.equal(saved.capturedAt, new Date(photo().lastModified).toISOString());
    assert.equal(saved.url, `/api/media/${saved.id}`);
    assert.equal(saved.thumbnailUrl, saved.url);
    assert.equal(bucket.objects.size, 2);
    assert.ok(bucket.objects.has(saved.key));
    assert.ok(bucket.objects.has(`roava/media/records/${saved.id}.json`));
    assert.equal((await fetch(`${base}/img/travel-photos/any.jpg`)).status, 404);
  });
  await withServer(bucket, async base => {
    const metadata = await fetch(`${base}/api/media/${saved.id}/meta`);
    assert.deepEqual(await metadata.json(), saved);
    const response = await fetch(`${base}${saved.url}`);
    assert.equal(response.headers.get('content-disposition'), 'inline');
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(await photo().arrayBuffer()));
    assert.equal((await fetch(`${base}${saved.url}`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${base}${saved.url}`)).status, 200);
    assert.equal(bucket.objects.size, 2);
  });
});

test('clear preserves originals and unrelated objects for recovery and shared references', async () => {
  const bucket = bucketFixture();
  await bucket.put('other-app/file', new Uint8Array([1]), {});
  await withServer(bucket, async base => {
    const generic = await fetch(`${base}/api/files`, { method: 'POST', body: 'document' });
    const file = await generic.json();
    for (let i = 0; i < 5; i++) assert.equal((await upload(base)).status, 201);
    assert.equal((await fetch(`${base}/api/media`, { method: 'DELETE' })).status, 204);
    assert.ok(bucket.objects.has('other-app/file'));
    assert.ok(bucket.objects.has(file.key));
    assert.equal(bucket.objects.size, 12);
  });
});

test('metadata write failures roll back the original instead of reporting a successful upload', async () => {
  const bucket = bucketFixture({ failMetadata: true });
  await withServer(bucket, async base => {
    const response = await upload(base);
    assert.equal(response.status, 502);
    assert.equal(bucket.objects.size, 0);
  });
});

test('Cloudflare Pages uses the same media API with a native R2 binding', async () => {
  const bucket = bucketFixture();
  const call = async (path, options = {}) => {
    const previous = globalThis.fetch;
    globalThis.fetch = api.fetcher;
    const headers = new Headers(options.headers); headers.set('authorization','Bearer test-token');
    try { return await onRequest({ request: new Request(`https://atlas.example${path}`, {...options,headers}), env: { ...testEnv, R2_STORAGE: bucket } }); }
    finally { globalThis.fetch = previous; }
  };
  const response = await call('/api/media', { method: 'POST', body: photo(), headers: { 'content-type': 'image/jpeg', 'x-file-name': encodeURIComponent(photo().name) } });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.fileName, photo().name);
  assert.equal((await call(saved.url)).status, 200);
  assert.equal((await call(`${saved.url}/meta`)).status, 200);
  assert.equal((await call(saved.url, { method: 'DELETE' })).status, 204);
  const generic = await call('/api/files', { method: 'POST', body: 'generic file' });
  assert.equal(generic.status, 201);
  assert.equal(await (await call((await generic.json()).url)).text(), 'generic file');
  const unavailable = await onRequest({ request: new Request('https://atlas.example/api/media', { method: 'POST', body: photo(), headers: { 'content-type': 'image/jpeg' } }), env: {} });
  assert.equal(unavailable.status, 503);
});

test('gallery, place and receipt storage calls reach the mounted API for save/read/delete/clear', async () => {
  const bucket = bucketFixture();
  const js = ts.transpileModule(readFileSync('src/app/core/storage/api-media.storage.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  await withServer(bucket, async base => {
    let legacyWrites = 0;
    const legacy = { get: async () => null, getRecord: async () => null, delete: async () => {}, clear: async () => {}, save: () => { legacyWrites++; } };
    const exports = {};
    vm.runInNewContext(js, {
      exports, Headers, AbortController, setTimeout, clearTimeout, Error, TypeError, SyntaxError,
      fetch: (url, options) => fetch(`${base}${url}`, options),
      require: name => name === '@angular/core' ? { Injectable: () => target => target, inject: () => testAuth } : {},
    });
    const storage = new exports.ApiMediaStorage();
    assert.equal(storage.location, 'api');
    const saved = await storage.save(photo(), 'trip', 'place');
    assert.equal((await storage.getRecord(saved.id)).key, saved.key);
    assert.deepEqual(new Uint8Array(await (await storage.get(saved.id)).arrayBuffer()), new Uint8Array(await photo().arrayBuffer()));
    await storage.delete(saved.id);
    assert.ok((await storage.getRecord(saved.id)).blob);
    await storage.save(photo(), 'receipt-trip');
    await storage.clear();
    assert.equal(bucket.objects.size, 4);
    assert.equal(legacyWrites, 0);
  });
});

test('unsupported photos and storage failures never fall back to disk or browser writes', async () => {
  await withServer(undefined, async base => {
    assert.equal((await upload(base, new File(['x'], 'bad.svg', { type: 'image/svg+xml' }))).status, 415);
    assert.equal((await upload(base)).status, 503);
  });
});
