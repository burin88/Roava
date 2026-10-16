import { publicSupabaseConfig } from './config/supabase-config.mjs';
import { handleStorageApi } from './storage-api.mjs';
import { MediaStorageService } from './services/media-storage.service.mjs';
import { handleRequirementsApi, isAnonymousRequirementsRead } from './requirements-api.mjs';

const json = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
function lazyStorage(factory) {
  let instance;
  return Object.fromEntries(['read','write','delete','list'].map(name => [name, (...args) => {
    instance ??= factory();
    return instance[name](...args);
  }]));
}

/** Validate access tokens with Auth, then use that token for DB access under RLS. */
export async function handleAuthenticatedApi(request, storageFactory, env = process.env, fetcher = fetch) {
  try {
    const config = publicSupabaseConfig(env);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/config') {
      return request.method === 'GET' ? json(200, config) : json(405, { error: 'Method not allowed' });
    }
    const authorization = request.headers.get('authorization');
    if (!authorization && isAnonymousRequirementsRead(request)) {
      return handleRequirementsApi(request, { config, headers: { apikey: config.publishableKey, 'content-type': 'application/json' }, user: null, fetcher });
    }
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'กรุณาเข้าสู่ระบบ' });
    const headers = { apikey: config.publishableKey, authorization, 'content-type': 'application/json' };
    const userResponse = await fetcher(`${config.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(15000) });
    if (!userResponse.ok) return json(userResponse.status >= 500 ? 502 : 401, { error: 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง' });
    const user = await userResponse.json();
    if (!user.id) return json(401, { error: 'Invalid session' });
    const requirementResponse = await handleRequirementsApi(request, { config, headers, user, fetcher });
    if (requirementResponse) return requirementResponse;
    async function db(table, query = '', method = 'GET', body, prefer) {
      const response = await fetcher(`${config.url}/rest/v1/${table}${query}`, {
        method, headers: { ...headers, ...(prefer ? { prefer } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Object.assign(new Error('Supabase media metadata request failed'), { status: 502 });
      // PostgREST return=minimal can return 201 Created with an empty body.
      // Parsing that response as JSON incorrectly turns a successful insert into
      // an upload failure (including the profile check before writing to R2).
      const bodyText = await response.text();
      return bodyText.trim() ? JSON.parse(bodyText) : null;
    }
    const match = pathname.match(/^\/api\/(media|files)(?:\/([0-9a-f-]+)(\/meta)?)?$/);
    if (!match) return json(404, { error: 'File not found' });
    const [, kind, id] = match;
    const ownerFilter = `profiles_id=eq.${user.id}`;
    if (kind === 'files') {
      // Generic files live in a per-account namespace, without adding another table.
      const storage = lazyStorage(storageFactory);
      const scoped = key => key.replace('roava/files/', `roava/files/${user.id}/`);
      return handleStorageApi(request, () => ({
        write: (key, ...args) => storage.write(scoped(key), ...args),
        read: key => storage.read(scoped(key)),
      }));
    }
    const filter = `?${ownerFilter}&id=eq.${encodeURIComponent(id ?? '')}`;
    if (request.method === 'POST' && !id) {
      await db('profiles', '?on_conflict=id', 'POST', {
        id: user.id, users_id: user.id, display_name: 'My Atlas',
      }, 'resolution=ignore-duplicates,return=minimal');
      const storage = lazyStorage(storageFactory);
      const uploadHeaders = new Headers(request.headers);
      uploadHeaders.set('x-owner-id', user.id);
      const result = await handleStorageApi(new Request(request, { headers: uploadHeaders }), () => storage);
      if (!result.ok) return result;
      const record = await result.clone().json();
      const type = request.headers.get('x-attachment-type') || (record.placeId ? 'place' : 'trip');
      const bucket = env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
      if (!bucket || !['trip', 'place', 'expense', 'import'].includes(type)) {
        await storage.delete(record.key);
        await storage.delete(`roava/media/records/${record.id}.json`);
        return json(503, { error: 'ตั้งค่า CLOUDFLARE_R2_BUCKET_NAME ให้ตรงกับ bucket ที่ใช้เก็บรูป' });
      }
      try {
        await db('attachments', '', 'POST', { id: record.id, profiles_id: user.id, type,
          storage_provider: 'r2', bucket, path: record.key, original_filename: record.fileName,
          mime_type: record.contentType, size_bytes: record.size, captured_at: record.capturedAt || null, status: 'ready' }, 'return=minimal');
      } catch (error) {
        await storage.delete(record.key).catch(() => {});
        await storage.delete(`roava/media/records/${record.id}.json`).catch(() => {});
        throw error;
      }
      return result;
    }
    if (request.method === 'DELETE') {
      // Keep originals for recovery/shared references. Deleting a gallery/receipt link
      // is performed transactionally by roava_write_document. No global bucket clear.
      return new Response(null, { status: 204 });
    }
    if (!id) return json(405, { error: 'Method not allowed' });
    const records = await db('attachments', `${filter}&valid=eq.true&select=id,status`);
    if (!records?.length) return json(404, { error: 'Photo not found' });
    const storage = storageFactory();
    const record = await new MediaStorageService(storage).getRecord(id);
    // DB rows are user-editable. They alone must never authorize a guessed R2 UUID.
    const objectOwner = record?.ownerId || env.R2_LEGACY_OWNER_ID;
    if (!record || objectOwner !== user.id) return json(404, { error: 'Photo not found' });
    if (records[0].status === 'missing_metadata' && env.CLOUDFLARE_R2_BUCKET_NAME) {
      await db('attachments', filter, 'PATCH', {
        bucket: env.CLOUDFLARE_R2_BUCKET_NAME, path: record.key, original_filename: record.fileName,
        mime_type: record.contentType, size_bytes: record.size ?? null,
        captured_at: record.capturedAt || null, status: 'ready',
      }, 'return=minimal');
    }
    return handleStorageApi(request, () => storage);
  } catch (error) {
    return json(error.status || 502, { error: error.status ? error.message : 'เชื่อมต่อบริการข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
}
