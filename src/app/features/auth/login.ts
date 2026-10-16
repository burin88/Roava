import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/auth/supabase.service';

@Component({
  selector: 'app-login', imports: [FormsModule],
  template: `
    <section class="login-wrap"><form class="login-card" (ngSubmit)="submit()">
      <span class="eyebrow">ROAVA · PERSONAL TRAVEL MEMORY</span>
      <h1>กลับมาบันทึกการเดินทาง</h1><p>เข้าสู่ระบบเพื่อเปิดทริปและความทรงจำของคุณ</p>
      <label for="email">อีเมล</label><input id="email" name="email" type="email" autocomplete="username" [(ngModel)]="email" required [disabled]="busy()">
      <label for="password">รหัสผ่าน</label><input id="password" name="password" type="password" autocomplete="current-password" [(ngModel)]="password" required [disabled]="busy()">
      @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
      <button type="submit" class="btn btn-primary" [disabled]="busy() || !email || !password">{{ busy() ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}</button>
    </form></section>`,
  styles: `
    .login-wrap{min-height:80vh;display:grid;place-items:center;padding:24px}
    .login-card{width:min(100%,460px);padding:36px;border:1px solid var(--bs-border-color);border-radius:20px;background:var(--bs-body-bg);box-shadow:0 20px 80px #0002}
    .eyebrow{font-size:11px;letter-spacing:2px;color:var(--bs-primary)}h1{font-size:27px;margin:18px 0 12px}p{color:var(--bs-secondary-color);line-height:1.7}
    label{display:block;margin:18px 0 6px}input{width:100%;padding:12px;border:1px solid var(--bs-border-color);border-radius:8px;background:var(--bs-body-bg);color:var(--bs-body-color)}
    button{width:100%;margin-top:24px;padding:12px}.error{color:var(--bs-danger);margin-top:16px}
  `,
})
export class Login {
  private readonly auth = inject(SupabaseService);
  email = ''; password = '';
  readonly busy = signal(false); readonly error = signal('');
  async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.auth.signIn(this.email, this.password); this.password = ''; }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ'); }
    finally { this.busy.set(false); }
  }
}
