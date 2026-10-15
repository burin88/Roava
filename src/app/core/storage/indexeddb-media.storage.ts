import { Injectable } from '@angular/core';
import { StoredMedia } from '../models/travel.models';
import { MediaStorage } from './media-storage';

const DB_NAME = 'travel-atlas-media'; const STORE_NAME = 'media';
@Injectable()
export class IndexedDbMediaStorage implements MediaStorage {
  readonly location = 'browser' as const;
  async save(file: File, tripId: string, placeId?: string): Promise<StoredMedia> {
    if (file.size > 25 * 1024 * 1024) throw new Error('รูปภาพมีขนาดเกิน 25 MB กรุณาเลือกรูปที่เล็กลง');
    const thumbnailBlob = await this.makeThumbnail(file);
    const record: StoredMedia = { id: crypto.randomUUID(), tripId, placeId, fileName: file.name, contentType: file.type, blob: file, thumbnailBlob, capturedAt: new Date(file.lastModified).toISOString() };
    await this.request('readwrite', (store) => store.put(record)); return record;
  }
  async get(id: string): Promise<Blob | null> { return (await this.getRecord(id))?.blob ?? null; }
  async getRecord(id: string): Promise<StoredMedia | null> { return (await this.request<StoredMedia>('readonly', (store) => store.get(id))) ?? null; }
  async delete(id: string): Promise<void> { await this.request('readwrite', (store) => store.delete(id)); }
  async clear(): Promise<void> { await this.request('readwrite', (store) => store.clear()); }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('เบราว์เซอร์นี้ไม่รองรับคลังรูป กรุณาใช้ Safari หรือ Chrome รุ่นปัจจุบัน')); return; }
      let settled = false;
      const fail = (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(this.storageError(error)); };
      const timer = setTimeout(() => fail(new Error('เปิดคลังรูปในอุปกรณ์ไม่สำเร็จ กรุณาปิดแท็บอื่นแล้วลองอีกครั้ง')),15000);
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(DB_NAME, 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath:'id' }); };
      request.onblocked = () => fail(new Error('คลังรูปถูกเปิดค้างในแท็บอื่น กรุณาปิดแท็บอื่นของเว็บนี้แล้วลองใหม่'));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timer);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  private async request<T = undefined>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction | undefined;
      let settled = false;
      const fail = (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); db.close(); reject(this.storageError(error)); };
      const timer = setTimeout(() => { fail(new Error('บันทึกคลังรูปใช้เวลานานเกินไป กรุณาลองอีกครั้ง')); try { transaction?.abort(); } catch {} },15000);
      try {
        transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        request.onerror = () => fail(request.error);
        transaction.onerror = () => fail(transaction!.error ?? request.error);
        transaction.onabort = () => fail(transaction!.error ?? new Error('การบันทึกรูปถูกยกเลิก กรุณาลองอีกครั้ง'));
        transaction.oncomplete = () => { if (settled) return; settled = true; clearTimeout(timer); db.close(); resolve(request.result as T); };
      } catch (error) { try { transaction?.abort(); } catch {} fail(error); }
    });
  }
  private async makeThumbnail(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.renderThumbnail(file).catch(() => file), new Promise<Blob>(resolve => { timer = setTimeout(() => resolve(file),5000); })]);
    } finally { clearTimeout(timer); }
  }
  private async renderThumbnail(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file); const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas');
    try { canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); }
    finally { bitmap.close(); }
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', .82));
  }
  private storageError(error: unknown): Error {
    if (error instanceof Error && error.name === 'QuotaExceededError') return new Error('พื้นที่เก็บรูปในอุปกรณ์เต็ม กรุณาเพิ่มพื้นที่ว่างแล้วลองอีกครั้ง');
    if (error instanceof Error && ['SecurityError','InvalidStateError'].includes(error.name)) return new Error('เบราว์เซอร์ไม่อนุญาตให้เก็บรูป กรุณาเปิดเว็บในโหมดปกติและอนุญาตการจัดเก็บข้อมูล');
    return error instanceof Error ? error : new Error('บันทึกรูปในอุปกรณ์ไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}
