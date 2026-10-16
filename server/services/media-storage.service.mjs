const mediaPrefix = 'roava/media/';
const recordsPrefix = `${mediaPrefix}records/`;
export const mediaIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const imageExtensions = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'],
  ['image/avif', '.avif'], ['image/heic', '.heic'], ['image/heif', '.heif'], ['image/bmp', '.bmp'],
]);

/** Originals and records both live in R2, without a disk or process-local index. */
export class MediaStorageService {
  constructor(storage) { this.storage = storage; }

  async save(body, metadata, id = crypto.randomUUID()) {
    if (!mediaIdPattern.test(id)) throw new Error('Invalid media ID');
    const extension = imageExtensions.get(metadata.contentType);
    if (!extension) throw Object.assign(new Error('Unsupported image type'), { status: 415 });
    const month = new Date().toISOString().slice(0, 7).replace('-', '/');
    const key = `${mediaPrefix}${month}/${id}${extension}`;
    const record = {
      id, key, ownerId: metadata.ownerId, tripId: metadata.tripId || 'journey', placeId: metadata.placeId || undefined,
      fileName: metadata.fileName, contentType: metadata.contentType, size: body.length,
      storedFileName: key.split('/').at(-1),
      capturedAt: metadata.capturedAt || new Date().toISOString(),
      url: `/api/media/${id}`, thumbnailUrl: `/api/media/${id}`,
    };
    await this.storage.write(key, body, record);
    try {
      await this.storage.write(`${recordsPrefix}${id}.json`, new TextEncoder().encode(JSON.stringify(record)), {
        fileName: `${id}.json`, contentType: 'application/json',
      });
    } catch (error) {
      await this.storage.delete(key).catch(() => {});
      throw error;
    }
    return record;
  }

  async getRecord(id) {
    if (!mediaIdPattern.test(id)) return null;
    const file = await this.storage.read(`${recordsPrefix}${id}.json`);
    if (!file) return null;
    const record = await new Response(file.body).json();
    if (record.id !== id || !record.key?.startsWith(mediaPrefix) || record.key.startsWith(recordsPrefix)) {
      throw new Error('Invalid stored media record');
    }
    return { ...record, url: `/api/media/${id}`, thumbnailUrl: `/api/media/${id}` };
  }

  async read(id) {
    const record = await this.getRecord(id);
    if (!record) return null;
    const file = await this.storage.read(record.key);
    return file ? { ...file, contentType: record.contentType } : null;
  }

  async delete(id) {
    const record = await this.getRecord(id);
    if (!record) return false;
    await this.storage.delete(record.key);
    await this.storage.delete(`${recordsPrefix}${id}.json`);
    return true;
  }

  async clear() {
    let cursor;
    do {
      const page = await this.storage.list(recordsPrefix, cursor);
      for (const key of page.keys) {
        const id = key.slice(recordsPrefix.length, -'.json'.length);
        await this.delete(id);
      }
      cursor = page.cursor;
    } while (cursor);
  }
}
