import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { extname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const mediaDirectory = join(projectRoot, 'img', 'travel-photos');
const indexPath = join(mediaDirectory, 'media-index.json');
const maximumFileSize = 25 * 1024 * 1024;
const extensions = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'],
  ['image/avif', '.avif'], ['image/heic', '.heic'], ['image/heif', '.heif'], ['image/bmp', '.bmp'],
]);

let indexQueue = Promise.resolve();

async function readIndex() {
  try { return JSON.parse(await readFile(indexPath, 'utf8')); }
  catch { return {}; }
}

function updateIndex(change) {
  indexQueue = indexQueue.then(async () => {
    const index = await readIndex();
    const next = change(index) ?? index;
    const temporaryPath = `${indexPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(next, null, 2), 'utf8');
    await rename(temporaryPath, indexPath);
    return next;
  });
  return indexQueue;
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function safeHeader(value, fallback = '') {
  try { return decodeURIComponent(Array.isArray(value) ? value[0] ?? fallback : value ?? fallback); }
  catch { return fallback; }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumFileSize) throw Object.assign(new Error('Photo exceeds the 25 MB limit'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function upload(request, response) {
  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].toLowerCase();
  const extension = extensions.get(contentType);
  if (!extension) return json(response, 415, { error: 'Unsupported image type' });
  const body = await readBody(request);
  if (!body.length) return json(response, 400, { error: 'The uploaded image is empty' });

  const id = randomUUID();
  const tripId = safeHeader(request.headers['x-trip-id'], 'journey');
  const slug = tripId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'journey';
  const storedFileName = `${slug}-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}${extension}`;
  const record = {
    id, tripId, placeId: safeHeader(request.headers['x-place-id']) || undefined,
    fileName: basename(safeHeader(request.headers['x-file-name'], `photo${extension}`)),
    storedFileName, contentType,
    capturedAt: safeHeader(request.headers['x-file-captured-at']) || new Date().toISOString(),
    url: `/img/travel-photos/${storedFileName}`,
    thumbnailUrl: `/img/travel-photos/${storedFileName}`,
  };
  await writeFile(join(mediaDirectory, storedFileName), body, { flag: 'wx' });
  await updateIndex((index) => ({ ...index, [id]: record }));
  json(response, 201, record);
}

async function metadata(response, id) {
  const record = (await readIndex())[id];
  if (!record) return json(response, 404, { error: 'Photo not found' });
  json(response, 200, record);
}

async function remove(response, id) {
  const record = (await readIndex())[id];
  if (!record) return json(response, 404, { error: 'Photo not found' });
  await unlink(join(mediaDirectory, record.storedFileName)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await updateIndex((index) => {
    const next = { ...index };
    delete next[id];
    return next;
  });
  response.writeHead(204);
  response.end();
}

async function clear(response) {
  const entries = await readdir(mediaDirectory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && entry.name !== '.gitkeep').map((entry) => unlink(join(mediaDirectory, entry.name))));
  response.writeHead(204);
  response.end();
}

async function serveImage(response, encodedName) {
  const requestedName = decodeURIComponent(encodedName);
  if (basename(requestedName) !== requestedName) return json(response, 400, { error: 'Invalid media path' });
  const record = Object.values(await readIndex()).find((item) => item.storedFileName === requestedName);
  if (!record) return json(response, 404, { error: 'Photo not found' });
  try {
    const image = await readFile(join(mediaDirectory, requestedName));
    response.writeHead(200, { 'content-type': record.contentType, 'cache-control': 'public, max-age=31536000, immutable' });
    response.end(image);
  } catch { json(response, 404, { error: 'Photo file not found' }); }
}

async function handle(request, response) {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'POST' && url.pathname === '/api/media') return await upload(request, response);
    if (request.method === 'DELETE' && url.pathname === '/api/media') return await clear(response);
    const metadataMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/meta$/);
    if (request.method === 'GET' && metadataMatch) return await metadata(response, decodeURIComponent(metadataMatch[1]));
    const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
    if (request.method === 'DELETE' && mediaMatch) return await remove(response, decodeURIComponent(mediaMatch[1]));
    const imageMatch = url.pathname.match(/^\/img\/travel-photos\/([^/]+)$/);
    if (request.method === 'GET' && imageMatch) return await serveImage(response, imageMatch[1]);
    json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Media server error:', error);
    json(response, error.status ?? 500, { error: error.message ?? 'Media server error' });
  }
}

export async function startMediaServer(port = Number(process.env.MEDIA_PORT || 4300)) {
  await mkdir(mediaDirectory, { recursive: true });
  const server = createServer((request, response) => void handle(request, response));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Photo media server ready at http://127.0.0.1:${port}`);
  console.log(`Photos are stored in ${mediaDirectory}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startMediaServer();

