import { inject, Injectable } from '@angular/core';
import { StoredMedia } from '../models/travel.models';
import { IndexedDbMediaStorage } from './indexeddb-media.storage';
import { MediaStorage } from './media-storage';

interface MediaApiRecord {
  id: string;
  tripId: string;
  placeId?: string;
  fileName: string;
  storedFileName: string;
  contentType: string;
  capturedAt?: string;
  url: string;
  thumbnailUrl: string;
}

@Injectable()
export class FileSystemMediaStorage implements MediaStorage {
  private readonly legacyStorage = inject(IndexedDbMediaStorage);

  async save(file: File, tripId: string, placeId?: string): Promise<StoredMedia> {
    const response = await fetch('/api/media', {
      method: 'POST',
      headers: {
        'content-type': file.type,
        'x-file-name': encodeURIComponent(file.name),
        'x-file-captured-at': new Date(file.lastModified).toISOString(),
        'x-trip-id': encodeURIComponent(tripId),
        ...(placeId ? { 'x-place-id': encodeURIComponent(placeId) } : {}),
      },
      body: file,
    });
    if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo upload failed'));
    return this.toStoredMedia(await response.json() as MediaApiRecord);
  }

  async get(id: string): Promise<Blob | null> {
    const record = await this.apiRecord(id);
    if (!record) return this.legacyStorage.get(id);
    const response = await fetch(record.url);
    return response.ok ? response.blob() : null;
  }

  async getRecord(id: string): Promise<StoredMedia | null> {
    const record = await this.apiRecord(id);
    return record ? this.toStoredMedia(record) : this.legacyStorage.getRecord(id);
  }

  async delete(id: string): Promise<void> {
    const response = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.status === 404) {
      await this.legacyStorage.delete(id);
      return;
    }
    if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo deletion failed'));
  }

  async clear(): Promise<void> {
    const response = await fetch('/api/media', { method: 'DELETE' });
    if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo cleanup failed'));
    await this.legacyStorage.clear();
  }

  private async apiRecord(id: string): Promise<MediaApiRecord | null> {
    const response = await fetch(`/api/media/${encodeURIComponent(id)}/meta`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo metadata could not be loaded'));
    return response.json() as Promise<MediaApiRecord>;
  }

  private toStoredMedia(record: MediaApiRecord): StoredMedia {
    return { ...record };
  }

  private async errorMessage(response: Response, fallback: string): Promise<string> {
    try { return (await response.json() as { error?: string }).error ?? fallback; }
    catch { return fallback; }
  }
}
