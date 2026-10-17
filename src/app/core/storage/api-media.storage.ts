import { inject, Injectable } from '@angular/core';
import { StoredMedia } from '../models/travel.models';
import { SupabaseService } from '../auth/supabase.service';
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
export class ApiMediaStorage implements MediaStorage {
  readonly location = 'api' as const;
  private readonly auth = inject(SupabaseService);

  async save(file: File, tripId: string, placeId?: string, type?: 'trip' | 'place' | 'expense' | 'import' | 'requirement'): Promise<StoredMedia> {
    if (file.size > 25 * 1024 * 1024) throw new Error('รูปภาพมีขนาดเกิน 25 MB กรุณาเลือกรูปที่เล็กลง');
    return this.request('/api/media', {
      method: 'POST',
      headers: {
        'content-type': file.type,
        'x-file-name': encodeURIComponent(file.name),
        'x-file-captured-at': new Date(file.lastModified).toISOString(),
        'x-trip-id': encodeURIComponent(tripId),
        'x-attachment-type': type || (placeId ? 'place' : 'trip'),
        ...(placeId ? { 'x-place-id': encodeURIComponent(placeId) } : {}),
      },
      body: file,
    }, async response => {
      if (!response.ok) throw new Error(await this.errorMessage(response, 'อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองอีกครั้ง'));
      const record = await response.json() as MediaApiRecord;
      if (!record.id || !record.url) throw new Error('เซิร์ฟเวอร์ตอบกลับข้อมูลรูปภาพไม่ครบ กรุณาลองอีกครั้ง');
      return this.toStoredMedia(record);
    }, 45000);
  }

  async get(id: string): Promise<Blob | null> {
    const record = await this.apiRecord(id);
    if (!record) return null;
    return this.request(record.url, {}, async response => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo could not be loaded'));
      return response.blob();
    }, 45000);
  }

  async getRecord(id: string): Promise<StoredMedia | null> {
    const record = await this.apiRecord(id);
    if (!record) return null;
    // <img> cannot attach a bearer header. Return a blob for the UI's object URL.
    const blob = await this.request(record.url, {}, async response => {
      if (!response.ok) throw new Error('โหลดรูปภาพไม่สำเร็จ');
      return response.blob();
    }, 45000);
    return { ...record, url: undefined, thumbnailUrl: undefined, blob };
  }

  async delete(id: string): Promise<void> {
    await this.request(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' }, async response => {
      if (response.status === 404) return;
      if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo deletion failed'));
    });
  }

  async clear(): Promise<void> {
    await this.request('/api/media', { method: 'DELETE' }, async response => {
      if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo cleanup failed'));
    });
  }

  private async apiRecord(id: string): Promise<MediaApiRecord | null> {
    return this.request(`/api/media/${encodeURIComponent(id)}/meta`, { cache: 'no-store' }, async response => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(await this.errorMessage(response, 'Photo metadata could not be loaded'));
      return response.json() as Promise<MediaApiRecord>;
    });
  }

  /** Deadline includes reading the response body, not just receiving headers. */
  private async request<T>(url: string, options: RequestInit, read: (response: Response) => Promise<T>, timeoutMs = 15000): Promise<T> {
    const token = await this.auth.token();
    const headers = new Headers(options.headers);
    headers.set('authorization', `Bearer ${token}`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('เซิร์ฟเวอร์รูปภาพตอบกลับช้าเกินไป กรุณาตรวจสอบการเชื่อมต่อแล้วลองบันทึกอีกครั้ง รูปที่เลือกยังอยู่'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fetch(url, { ...options, headers, signal: controller.signal }).then(read), deadline]);
    } catch (error) {
      if (error instanceof TypeError) throw new Error('ติดต่อเซิร์ฟเวอร์รูปภาพไม่ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง');
      if (error instanceof SyntaxError) throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ใช่ข้อมูลรูปภาพ กรุณาตรวจสอบว่า API รูปภาพพร้อมใช้งาน');
      throw error;
    } finally { clearTimeout(timer); }
  }

  private toStoredMedia(record: MediaApiRecord): StoredMedia {
    return { ...record };
  }

  private async errorMessage(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    if (data?.code === 'R2_BINDING_MISSING') return 'ยังไม่ได้เชื่อมต่อพื้นที่เก็บรูปบนเซิร์ฟเวอร์ กรุณาตั้งค่า R2 bucket binding ชื่อ R2_STORAGE ใน Cloudflare Pages แล้ว deploy ใหม่';
    if (data?.code === 'R2_BUCKET_NAME_MISSING') return 'ยังไม่ได้ตั้งชื่อพื้นที่เก็บรูป กรุณาตั้งค่า CLOUDFLARE_R2_BUCKET_NAME ใน Cloudflare Pages ให้ตรงกับ R2 bucket แล้ว deploy ใหม่';
    const failures: Record<string, string> = {
      R2_OBJECT_WRITE_FAILED: 'เขียนไฟล์รูปลงพื้นที่เก็บรูปไม่สำเร็จ',
      R2_RECORD_WRITE_FAILED: 'เขียนข้อมูลกำกับรูปลงพื้นที่เก็บรูปไม่สำเร็จ',
      MEDIA_PROFILE_FAILED: 'เตรียมบัญชีสำหรับแนบรูปไม่สำเร็จ',
      MEDIA_METADATA_FAILED: 'บันทึกข้อมูลรูปในฐานข้อมูลไม่สำเร็จ',
    };
    if (data?.code && Object.hasOwn(failures, data.code)) return `${failures[data.code]} (${data.code}) กรุณาลองใหม่อีกครั้ง รูปที่เลือกยังอยู่`;
    if ([502,503,504].includes(response.status)) return 'บริการบันทึกรูปภาพยังไม่พร้อม กรุณาลองใหม่อีกครั้ง';
    if (response.status === 404) return 'ไม่พบ API รูปภาพบนเซิร์ฟเวอร์ที่กำลังใช้งาน';
    return typeof data?.error === 'string' ? data.error : fallback;
  }
}
