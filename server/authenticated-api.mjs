import { publicSupabaseConfig } from './config/supabase-config.mjs';
import { handleStorageApi } from './storage-api.mjs';
import { MediaStorageService } from './services/media-storage.service.mjs';
import { handleRequirementsApi } from './requirements-api.mjs';
import { r2PublicObjectUrl } from './config/r2-public-url.mjs';

const json = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
function lazyStorage(factory) {
  let instance;
  return Object.fromEntries(['read','write','delete','list'].map(name => [name, (...args) => {
    instance ??= factory();
    return instance[name](...args);
  }]));
}

/** Requirements allow anonymous access; supplied tokens are validated and forwarded for RLS. */
export async function handleAuthenticatedApi(request, storageFactory, env = process.env, fetcher = fetch) {
  try {
    const config = publicSupabaseConfig(env);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/config') {
      return request.method === 'GET' ? json(200, config) : json(405, { error: 'Method not allowed' });
    }
    const authorization = request.headers.get('authorization');
    if (!authorization) {
      const requirementResponse = await handleRequirementsApi(request, {
        config, headers: { apikey: config.publishableKey, 'content-type': 'application/json' }, fetcher, storageFactory,
      });
      if (requirementResponse) return requirementResponse;
    }
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'กรุณาเข้าสู่ระบบ' });
    const headers = { apikey: config.publishableKey, authorization, 'content-type': 'application/json' };
    const userResponse = await fetcher(`${config.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(15000) });
    if (!userResponse.ok) return json(userResponse.status >= 500 ? 502 : 401, { error: 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง' });
    const user = await userResponse.json();
    if (!user.id) return json(401, { error: 'Invalid session' });
    const requirementResponse = await handleRequirementsApi(request, { config, headers, fetcher, user, storageFactory });
    if (requirementResponse) return requirementResponse;
    async function db(table, query = '', method = 'GET', body, prefer) {
      const response = await fetcher(`${config.url}/rest/v1/${table}${query}`, {
        method, headers: { ...headers, ...(prefer ? { prefer } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Object.assign(new Error('Supabase media metadata request failed'), {
        status: 502, code: table === 'profiles' ? 'MEDIA_PROFILE_FAILED' : 'MEDIA_METADATA_FAILED',
      });
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
      const bucket = env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
      if (!bucket) return json(503, {
        error: 'ตั้งค่า CLOUDFLARE_R2_BUCKET_NAME ให้ตรงกับ bucket ที่ใช้เก็บรูป', code: 'R2_BUCKET_NAME_MISSING',
      });
      const type = request.headers.get('x-attachment-type') || (request.headers.get('x-place-id') ? 'place' : 'trip');
      if (!['trip', 'place', 'expense', 'import', 'requirement'].includes(type)) return json(400, { error: 'Invalid attachment type' });
      // Validate the optional public domain before writing an object. Only requirement
      // image URLs are recorded; this does not change access to the bucket itself.
      if (type === 'requirement') r2PublicObjectUrl(env.R2_PUBLIC_BASE_URL, 'config-check');
      await db('profiles', '?on_conflict=id', 'POST', {
        id: user.id, users_id: user.id, display_name: 'My Atlas',
      }, 'resolution=ignore-duplicates,return=minimal');
      const storage = lazyStorage(storageFactory);
      const uploadHeaders = new Headers(request.headers);
      uploadHeaders.set('x-owner-id', user.id);
      const result = await handleStorageApi(new Request(request, { headers: uploadHeaders }), () => storage);
      if (!result.ok) return result;
      const record = await result.clone().json();
      try {
        await db('attachments', '', 'POST', { id: record.id, profiles_id: user.id, type,
          storage_provider: 'r2', bucket, path: record.key,
          ...(type === 'requirement' ? { url: r2PublicObjectUrl(env.R2_PUBLIC_BASE_URL, record.key) } : {}), original_filename: record.fileName,
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
    return json(error.status || 502, { error: error.status ? error.message : 'เชื่อมต่อบริการข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง',
      ...(['MEDIA_PROFILE_FAILED', 'MEDIA_METADATA_FAILED'].includes(error.code) ? { code: error.code } : {}),
    });
  }
}
