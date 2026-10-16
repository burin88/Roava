import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TravelStore } from '../core/state/travel-store';

@Component({
  selector: 'authenticated-workspace', imports: [RouterOutlet],
  template: `
    @if (!store.ready()) { <p class="p-5 text-center" role="status">กำลังโหลดการเดินทางของคุณ…</p> }
    @else if (store.loadError()) {
      <section class="alert alert-danger m-4" role="alert">{{ store.loadError() }}
        <button class="btn btn-outline-secondary ms-3" (click)="retry()">ลองอีกครั้ง</button>
      </section>
    } @else { <router-outlet /> }
  `,
})
export class AuthenticatedWorkspace {
  readonly store = inject(TravelStore);
  async retry(): Promise<void> { await this.store.reload().catch(() => {}); }
}
