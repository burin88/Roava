import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  async start(): Promise<void> {
    // Onboarding is disabled for all visits, including explicit start requests.
    // Keep this entry point inert so it cannot navigate or display a tour.
  }
}
