import assert from 'node:assert/strict';
import { supabaseFixture, fetchWithAuth as fetch, testAuth } from './fixtures/supabase-api.mjs';
import { handleNodeStorageApi } from '../server/node-storage-api.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { readR2Config } from '../server/config/r2-config.mjs';
import { R2StorageService } from '../server/services/r2-storage.service.mjs';
import { handleFilesApi, maximumUploadSize } from '../server/files-api.mjs';

const env = {
  CLOUDFLARE_R2_ACCOUNT_ID: 'account',
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'access',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
  CLOUDFLARE_R2_BUCKET_NAME: 'test-bucket',
};

test('R2 configuration supports the default endpoint and safe configuration errors', () => {
  assert.equal(readR2Config(env).serviceUrl, 'https://account.r2.cloudflarestorage.com');
  assert.equal(readR2Config({ ...env, CLOUDFLARE_R2_SERVICE_URL: 'https://custom.example.com' }).serviceUrl, 'https://custom.example.com');
  assert.throws(() => readR2Config({}), error => error.status === 503 && /accountId/.test(error.message));
  assert.throws(() => readR2Config({ ...env, CLOUDFLARE_R2_SERVICE_URL: 'http://example.com' }), /HTTPS origin/);
  assert.throws(() => readR2Config({ ...env, CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'YOUR_SECRET' }), /secretAccessKey/);
});

test('storage writes the configured bucket and preserves Unicode file metadata when reading', async () => {
  const commands = [];
  const name = 'ใบเสร็จ.pdf';
  const bytes = Buffer.from('example PDF');
  const storage = new R2StorageService(readR2Config(env), {
    send: async command => {
      commands.push(command);
      return command.constructor.name === 'PutObjectCommand'
        ? { ETag: '"etag"' }
        : { Body: Readable.from([bytes]), ContentType: 'application/pdf', ContentLength: bytes.length,
          Metadata: { filename: encodeURIComponent(name) } };
    },
  });
  const saved = await storage.write('test/key', bytes, { fileName: name, contentType: 'application/pdf' });
  assert.equal(saved.size, bytes.length);
  assert.equal(commands[0].input.Bucket, 'test-bucket');
  assert.equal(commands[0].input.Key, 'test/key');
  assert.equal(commands[0].input.Metadata.filename, encodeURIComponent(name));
  const file = await storage.read('test/key');
  assert.equal(file.fileName, name);
  assert.equal(await file.body.toArray().then(chunks => Buffer.concat(chunks).toString()), bytes.toString());
});

test('missing R2 objects return null, while access errors are not mistaken for missing files', async () => {
  const missing = new R2StorageService(readR2Config(env), { send: async () => { throw { name: 'NoSuchKey' }; } });
  assert.equal(await missing.read('missing'), null);
  const denied = new R2StorageService(readR2Config(env), { send: async () => { throw new Error('AccessDenied'); } });
  await assert.rejects(denied.read('private'), /AccessDenied/);
});

test('real S3 SDK signs requests, sends file metadata and reads bytes from an S3-compatible endpoint', async () => {
  const requests = [];
  let bytes;
  let metadata;
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      bytes = Buffer.concat(chunks);
      metadata = request.headers['x-amz-meta-filename'];
      response.writeHead(200, { etag: '"sdk-etag"' });
      response.end();
    } else {
      response.writeHead(200, {
        'content-type': 'application/pdf', 'content-length': bytes.length,
        'x-amz-meta-filename': metadata,
      });
      response.end(bytes);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  // Only this fixture substitutes HTTP loopback; normal config requires HTTPS.
  const storage = new R2StorageService({ ...readR2Config(env), serviceUrl: `http://127.0.0.1:${server.address().port}` });
  try {
    const body = Buffer.from([0, 11, 255]);
    await storage.write('roava/files/sdk-test', body, { fileName: 'ใบเสร็จ.pdf', contentType: 'application/pdf' });
    const file = await storage.read('roava/files/sdk-test');
    assert.deepEqual(Buffer.concat(await file.body.toArray()), body);
    assert.equal(file.fileName, 'ใบเสร็จ.pdf');
    assert.deepEqual(requests.map(request => request.method), ['PUT', 'GET']);
    assert.match(requests[0].url, /^\/test-bucket\/roava\/files\/sdk-test/);
    assert.match(requests[0].headers.authorization, /^AWS4-HMAC-SHA256 Credential=access\//);
  } finally {
    storage.client.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});

async function withApi(run, storageFactory) {
  const objects = new Map();
  const service = {
    write: async (key, body, metadata) => {
      objects.set(key, { ...metadata, body, size: body.length });
      return { key, ...metadata, size: body.length };
    },
    read: async key => {
      const file = objects.get(key);
      return file ? { ...file, body: Readable.from([file.body]) } : null;
    },
  };
  const server = createServer(async (request, response) => {
    if (!await handleNodeStorageApi(request, response, storageFactory ?? (() => service), supabaseFixture())) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, objects); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('HTTP upload/read round-trip is binary-safe, uses unique IDs and downloads Unicode names safely', async () => {
  await withApi(async base => {
    const bytes = Buffer.from([0, 255, 42, 10, 0]);
    const upload = () => fetch(`${base}/api/files`, {
      method: 'POST', headers: { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent('ใบเสร็จ.pdf') }, body: bytes,
    });
    const response = await upload();
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(response.headers.get('location'), saved.url);
    assert.equal(saved.fileName, 'ใบเสร็จ.pdf');
    assert.equal(saved.size, bytes.length);
    assert.notEqual((await (await upload()).json()).id, saved.id);
    const download = await fetch(`${base}${saved.url}`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/pdf');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(download.headers.get('content-disposition').includes(encodeURIComponent(saved.fileName)));
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  });
});

test('API rejects empty, malformed, multipart and oversized uploads before writing', async () => {
  await withApi(async (base, objects) => {
    for (const [options, status] of [
      [{ body: '' }, 400],
      [{ body: 'x', headers: { 'x-file-name': '%zz' } }, 400],
      [{ body: 'x', headers: { 'x-file-name': encodeURIComponent('bad\r\nname') } }, 400],
      [{ body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=test' } }, 415],
      [{ body: Buffer.alloc(maximumUploadSize + 1) }, 413],
    ]) {
      const response = await fetch(`${base}/api/files`, { method: 'POST', ...options });
      assert.equal(response.status, status, await response.text());
    }
    assert.equal(objects.size, 0);
  });
});

test('chunked uploads cannot bypass the size limit and still receive a 413 JSON response', async () => {
  await withApi(async (base, objects) => {
    const response = await fetch(`${base}/api/files`, {
      method: 'POST', duplex: 'half',
      body: Readable.from(Array.from({ length: 26 }, () => Buffer.alloc(1024 * 1024))),
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /25 MB/);
    assert.equal(objects.size, 0);
  });
});

test('API rejects missing IDs, arbitrary bucket paths and unsupported methods', async () => {
  await withApi(async base => {
    for (const path of ['/api/files/not-an-id', '/api/files/..%2Fsecret', '/api/files/00000000-0000-4000-8000-000000000000']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404);
    }
    const response = await fetch(`${base}/api/files`);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });
});

test('unconfigured storage reports 503; upstream failures return 502 without secrets', async () => {
  await withApi(async base => {
    const response = await fetch(`${base}/api/files`, { method: 'POST', body: 'x' });
    assert.equal(response.status, 503);
  }, () => { throw Object.assign(new Error('Cloudflare R2 configuration is missing: accountId'), { status: 503 }); });
  await withApi(async base => {
    const response = await fetch(`${base}/api/files`, { method: 'POST', body: 'x' });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'Cloudflare R2 storage request failed');
  }, () => { throw new Error('secret-key-upstream-error'); });
});

test('Angular service writes and reads through the HTTP API and preserves API errors', async () => {
  const js = ts.transpileModule(readFileSync('src/app/core/storage/r2-storage.service.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  await withApi(async base => {
    const exports = {};
    vm.runInNewContext(js, {
      exports, Headers, AbortController, setTimeout, clearTimeout,
      fetch: (url, options) => fetch(`${base}${url}`, options),
      require: () => ({ Injectable: () => target => target, inject: () => testAuth }),
    });
    const service = new exports.R2StorageService();
    const bytes = Buffer.from([1, 0, 255, 9]);
    const saved = await service.write(new File([bytes], 'เอกสาร.bin'));
    assert.equal(saved.contentType, 'application/octet-stream');
    assert.deepEqual(Buffer.from(await (await service.read(saved.id)).arrayBuffer()), bytes);
    await assert.rejects(service.read('missing'), /File not found/);
    await assert.rejects(service.write(new File([], 'empty')), /empty/);
    await assert.rejects(service.write({ size: maximumUploadSize + 1 }), /25 MB/);
  });
});
