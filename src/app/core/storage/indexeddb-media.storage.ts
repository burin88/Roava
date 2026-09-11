import { Injectable } from '@angular/core';
import { StoredMedia } from '../models/travel.models';
import { MediaStorage } from './media-storage';

const DB_NAME = 'travel-atlas-media'; const STORE_NAME = 'media';
@Injectable()
export class IndexedDbMediaStorage implements MediaStorage {
  async save(file: File, tripId: string, placeId?: string): Promise<StoredMedia> {
    const thumbnailBlob = await this.makeThumbnail(file);
    const record: StoredMedia = { id: crypto.randomUUID(), tripId, placeId, fileName: file.name, contentType: file.type, blob: file, thumbnailBlob, capturedAt: new Date(file.lastModified).toISOString() };
    await this.request('readwrite', (store) => store.put(record)); return record;
  }
  async get(id: string): Promise<Blob | null> { return (await this.getRecord(id))?.blob ?? null; }
  async getRecord(id: string): Promise<StoredMedia | null> { return (await this.request<StoredMedia>('readonly', (store) => store.get(id))) ?? null; }
  async delete(id: string): Promise<void> { await this.request('readwrite', (store) => store.delete(id)); }
  async clear(): Promise<void> { await this.request('readwrite', (store) => store.clear()); }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  private async request<T = undefined>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open(); return new Promise<T>((resolve, reject) => { const transaction = db.transaction(STORE_NAME, mode); const request = action(transaction.objectStore(STORE_NAME)); request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(request.error); transaction.oncomplete = () => db.close(); });
  }
  private async makeThumbnail(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file); const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', .82));
  }
}
