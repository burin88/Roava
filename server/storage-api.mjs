import { MediaStorageService, imageExtensions, mediaIdPattern } from './services/media-storage.service.mjs';

export const maximumUploadSize = 25 * 1024 * 1024;
const filePrefix = 'roava/files/';

function json(status, value, headers = {}) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function header(request, name, fallback = '') {
  let value;
  try { value = decodeURIComponent(request.headers.get(name) ?? fallback); }
  catch { throw Object.assign(new Error(`Invalid encoded ${name}`), { status: 400 }); }
  if (/[\x00-\x1f\x7f]/.test(value) || new TextEncoder().encode(value).length > 255) {
    throw Object.assign(new Error(`Invalid ${name}: maximum 255 UTF-8 bytes, without control characters`), { status: 400 });
  }
  return value;
}

async function uploadBody(request) {
  if (Number(request.headers.get('content-length')) > maximumUploadSize) {
    throw Object.assign(new Error('File exceeds the 25 MB limit'), { status: 413 });
  }
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('The uploaded file is empty'), { status: 400 });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximumUploadSize) throw Object.assign(new Error('File exceeds the 25 MB limit'), { status: 413 });
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw Object.assign(new Error('The uploaded file is empty'), { status: 400 });
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

function fileResponse(file, inline = false) {
  const name = encodeURIComponent(file.fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(file.body, { headers: {
    'content-type': file.contentType,
    'content-disposition': inline ? 'inline' : `attachment; filename="file"; filename*=UTF-8''${name}`,
    'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store',
    ...(file.size !== undefined ? { 'content-length': String(file.size) } : {}),
    ...(file.etag ? { etag: file.etag } : {}),
  } });
}

/** Shared Web API for the Node server and Cloudflare Pages Functions. */
export async function handleStorageApi(request, storageFactory) {
  const match = new URL(request.url).pathname.match(/^\/api\/(media|files)(?:\/([^/]+)(\/meta)?)?$/);
  if (!match) return json(404, { error: 'Not found' });
  const [, resource, id, meta] = match;
  const isMedia = resource === 'media';
  try {
    if (id && !mediaIdPattern.test(id)) return json(404, { error: 'File not found' });
    if (meta && !isMedia) return json(404, { error: 'Not found' });
    const allowed = id ? (meta ? ['GET'] : isMedia ? ['GET', 'DELETE'] : ['GET']) : isMedia ? ['POST', 'DELETE'] : ['POST'];
    if (!allowed.includes(request.method)) return json(405, { error: 'Method not allowed' }, { allow: allowed.join(', ') });

    if (request.method === 'POST') {
      const contentType = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
      if (isMedia ? !imageExtensions.has(contentType) : !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(contentType) || contentType.startsWith('multipart/')) {
        return json(415, { error: isMedia ? 'Unsupported image type' : 'Send the raw file body with its Content-Type, not multipart/form-data' });
      }
      const fileName = header(request, 'x-file-name', 'file').split(/[\\/]/).at(-1);
      if (!fileName) return json(400, { error: 'File name is empty' });
      const metadata = { fileName, contentType };
      if (isMedia) {
        metadata.ownerId = request.headers.get('x-owner-id') || undefined;
        metadata.tripId = header(request, 'x-trip-id', 'journey');
        metadata.placeId = header(request, 'x-place-id');
        metadata.capturedAt = header(request, 'x-file-captured-at');
      }
      const storage = storageFactory();
      const body = await uploadBody(request);
      if (isMedia) {
        const record = await new MediaStorageService(storage).save(body, metadata);
        return json(201, record, { location: record.url });
      }
      const newId = crypto.randomUUID();
      const result = await storage.write(`${filePrefix}${newId}`, body, metadata);
      const url = `/api/files/${newId}`;
      return json(201, { id: newId, ...result, url }, { location: url });
    }

    const storage = storageFactory();
    const media = new MediaStorageService(storage);
    if (request.method === 'DELETE') {
      if (id && !await media.delete(id)) return json(404, { error: 'Photo not found' });
      if (!id) await media.clear();
      return new Response(null, { status: 204 });
    }
    if (meta) {
      const record = await media.getRecord(id);
      return record ? json(200, record) : json(404, { error: 'Photo not found' });
    }
    const file = isMedia ? await media.read(id) : await storage.read(`${filePrefix}${id}`);
    return file ? fileResponse(file, isMedia) : json(404, { error: 'File not found' });
  } catch (error) {
    return json(error.status ?? 502, { error: error.status ? error.message : 'Cloudflare R2 storage request failed' });
  }
}
