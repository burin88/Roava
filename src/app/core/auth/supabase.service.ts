import { Injectable, signal } from '@angular/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  readonly configError = signal('');
  private clientInstance?: SupabaseClient;
  readonly initialized = this.initialize();

  private async initialize(): Promise<void> {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.url || !config.publishableKey) throw new Error(config.error || 'โหลดการตั้งค่า Supabase ไม่สำเร็จ');
      const { createClient } = await import('@supabase/supabase-js');
      this.clientInstance = createClient(config.url, config.publishableKey);
      this.clientInstance.auth.onAuthStateChange((_event, session) => {
        const previousId = this.user()?.id;
        this.user.set(session?.user ?? null);
        if (this.ready() && previousId && previousId !== session?.user?.id) window.location.reload();
      });
      const { data, error } = await this.clientInstance.auth.getSession();
      if (error) throw error;
      this.user.set(data.session?.user ?? null);
    } catch (error) { this.configError.set(error instanceof Error ? error.message : 'เชื่อมต่อ Supabase ไม่สำเร็จ'); }
    finally { this.ready.set(true); }
  }
  async client(): Promise<SupabaseClient> {
    await this.initialized;
    if (!this.clientInstance) throw new Error(this.configError() || 'Supabase ยังไม่พร้อม');
    return this.clientInstance;
  }
  async token(): Promise<string> {
    const client = await this.client();
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('กรุณาเข้าสู่ระบบอีกครั้ง');
    return data.session.access_token;
  }
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await (await this.client()).auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมล รหัสผ่าน และการยืนยันอีเมล');
  }
  async signOut(): Promise<void> {
    const { error } = await (await this.client()).auth.signOut({ scope: 'local' });
    if (error) throw error;
    // Discard singleton stores and object URLs when switching accounts.
    window.location.reload();
  }
}
