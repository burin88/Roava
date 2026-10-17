import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from './core/auth/supabase.service';
import { Login } from './features/auth/login';
import { AuthenticatedWorkspace } from './shared/authenticated-workspace';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Login, AuthenticatedWorkspace],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly auth = inject(SupabaseService);
  readonly signOutError = signal('');
  readonly router = inject(Router);
  readonly theme = signal<'dark' | 'light'>(this.loadTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-bs-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('atlas-theme', theme);
    });
  }

  setTheme(theme: 'dark' | 'light'): void { this.theme.set(theme); }
  anonymousRequirements(): boolean { return /^\/requirements(?:\/[^/]+)?\/?$/.test(this.router.url.split(/[?#]/)[0]); }
  retry(): void { window.location.reload(); }
  async signOut(): Promise<void> {
    try { await this.auth.signOut(); }
    catch { this.signOutError.set('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  }

  private loadTheme(): 'dark' | 'light' {
    return localStorage.getItem('atlas-theme') === 'light' ? 'light' : 'dark';
  }
}
