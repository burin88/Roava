import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';

export interface R2StoredFile {
  id: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  etag?: string;
  url: string;
}

/** All R2 access goes through the server API; no bucket credentials enter the browser. */
@Injectable({ providedIn: 'root' })
export class R2StorageService {
  private readonly auth = inject(SupabaseService);
  private readonly baseUrl = '/api/files';

  async write(file: File): Promise<R2StoredFile> {
    if (!file.size) throw new Error('The uploaded file is empty');
    if (file.size > 25 * 1024 * 1024) throw new Error('File exceeds the 25 MB limit');
    return this.request(this.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
      },
      body: file,
    }, response => response.json() as Promise<R2StoredFile>);
  }

  async read(id: string): Promise<Blob> {
    return this.request(`${this.baseUrl}/${encodeURIComponent(id)}`, {}, response => response.blob());
  }

  private async request<T>(url: string, options: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('authorization', `Bearer ${await this.auth.token()}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(url, { ...options, headers, signal: controller.signal });
      if (!response.ok) {
        const details = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(details?.error ?? `File request failed (${response.status})`);
      }
      return await read(response);
    } finally { clearTimeout(timeout); }
  }
}
