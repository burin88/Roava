/** Same storage contract as the S3 service, backed by a Cloudflare R2 binding. */
export class R2BindingStorageService {
  constructor(bucket) {
    if (!bucket) throw Object.assign(new Error('Cloudflare R2 binding R2_STORAGE is missing'), { status: 503 });
    this.bucket = bucket;
  }
  async write(key, body, { contentType = 'application/octet-stream', fileName = 'file' } = {}) {
    const result = await this.bucket.put(key, body, {
      httpMetadata: { contentType }, customMetadata: { filename: encodeURIComponent(fileName) },
    });
    return { key, fileName, contentType, size: body.length, etag: result.httpEtag };
  }
  async read(key) {
    const object = await this.bucket.get(key);
    if (!object) return null;
    let fileName = 'file';
    try { fileName = decodeURIComponent(object.customMetadata?.filename ?? 'file'); } catch { /* safe fallback */ }
    return {
      key, body: object.body, fileName,
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      size: object.size, etag: object.httpEtag,
    };
  }
  async delete(key) { await this.bucket.delete(key); }
  async list(prefix, cursor) {
    const result = await this.bucket.list({ prefix, cursor, limit: 100 });
    return { keys: result.objects.map(object => object.key), cursor: result.truncated ? result.cursor : undefined };
  }
}
