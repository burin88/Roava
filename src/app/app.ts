import { Component, afterNextRender, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OnboardingTourService } from './shared/onboarding/onboarding-tour.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly router = inject(Router);
  readonly theme = signal<'dark' | 'light'>(this.loadTheme());
  private readonly onboarding = inject(OnboardingTourService);

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-bs-theme', theme);
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('atlas-theme', theme);
    });
    afterNextRender(() => this.onboarding.startIfFirstVisit());
  }

  setTheme(theme: 'dark' | 'light'): void { this.theme.set(theme); }

  openOnboarding(): void {
    void this.onboarding.start();
  }

  private loadTheme(): 'dark' | 'light' {
    return localStorage.getItem('atlas-theme') === 'light' ? 'light' : 'dark';
  }
}
