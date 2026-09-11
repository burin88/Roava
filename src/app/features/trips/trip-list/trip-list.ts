import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { cityByCode, countryByCode } from '../../../core/data/asia-catalog';
import { Trip } from '../../../core/models/travel.models';
import { MediaStorage } from '../../../core/storage/media-storage';
import { TravelStore } from '../../../core/state/travel-store';
import { SummaryProvider } from '../../../core/summary/summary-provider';
import { WorldGlobe } from '../../../shared/world-globe/world-globe';
import { TripEditor } from '../trip-editor/trip-editor';

@Component({ selector: 'trip-list', standalone: true, imports: [CommonModule, FormsModule, RouterLink, DatePipe, TripEditor, WorldGlobe], templateUrl: './trip-list.html', styleUrl: './trip-list.css' })
export class TripList {
  readonly store = inject(TravelStore); private readonly media = inject(MediaStorage); private readonly summaries = inject(SummaryProvider); readonly query = signal(''); readonly editorOpen = signal(false); readonly editing = signal<Trip | null>(null);
  readonly archiveSummary = computed(() => this.summaries.generateArchiveSummary(this.store.trips()));
  readonly visitedCountryCodes = computed(() => [...this.store.visitedCountries()]);
  readonly filtered = computed(() => { const query = this.query().toLowerCase(); return [...this.store.trips()].filter((trip) => `${trip.name} ${countryByCode(trip.countryCode)?.name} ${this.cityName(trip)} ${trip.tags.join(' ')}`.toLowerCase().includes(query)).sort((a,b) => b.startDate.localeCompare(a.startDate)); });
  country(code: string) { return countryByCode(code); } city(countryCode: string, cityCode: string) { return cityByCode(countryCode, cityCode); }
  cityName(trip: Trip): string { return cityByCode(trip.countryCode, trip.cityCode)?.name ?? trip.cityName ?? trip.cityCode.replace(/_/g, ' '); }
  flagIconPath(code: string): string { return `/assets/flags/4x3/${code.toLowerCase()}.svg`; }
  open(trip: Trip | null): void { this.editing.set(trip); this.editorOpen.set(true); }
  async save(trip: Trip): Promise<void> { await this.store.save(trip); this.editorOpen.set(false); }
  async remove(trip: Trip): Promise<void> { if (!confirm(`Delete “${trip.name}”?`)) return; await Promise.all(trip.mediaIds.map((id) => this.media.delete(id))); await this.store.delete(trip.id); }
}
