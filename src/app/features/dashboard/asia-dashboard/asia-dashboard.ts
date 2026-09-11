import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AtlasMap } from '../../../shared/atlas-map/atlas-map';
import { TripEditor } from '../../trips/trip-editor/trip-editor';
import { TravelStore } from '../../../core/state/travel-store';
import { CONTINENTS, ContinentCode, continentByCode, countriesByContinent, countryByCode } from '../../../core/data/asia-catalog';
import { MediaStorage } from '../../../core/storage/media-storage';
import { TravelDocument, Trip } from '../../../core/models/travel.models';
import { PhotoImporter } from '../../media/photo-importer/photo-importer';

@Component({ selector: 'asia-dashboard', standalone: true, imports: [CommonModule, DatePipe, DecimalPipe, AtlasMap, TripEditor, PhotoImporter], templateUrl: './asia-dashboard.html', styleUrl: './asia-dashboard.css' })
export class AsiaDashboard {
  readonly store = inject(TravelStore); private readonly router = inject(Router); private readonly route = inject(ActivatedRoute); private readonly media = inject(MediaStorage);
  readonly selectedCountry = signal<string | null>(null); readonly editorOpen = signal(false); readonly photoImporterOpen = signal(false); readonly toast = signal('');
  readonly countrySearch = signal(''); readonly countrySearchOpen = signal(false);
  readonly continents = CONTINENTS; readonly continentCode = signal<ContinentCode>('AS');
  private pendingCountryCode: string | null = null;
  readonly continent = computed(() => continentByCode(this.continentCode()));
  readonly countries = computed(() => countriesByContinent(this.continentCode()));
  readonly country = computed(() => this.countries().find((country) => country.code === this.selectedCountry()));
  readonly continentTrips = computed(() => { const codes = new Set(this.countries().map((country) => country.code)); return this.store.trips().filter((trip) => codes.has(trip.countryCode)); });
  readonly continentStats = computed(() => {
    const trips = this.continentTrips();
    return {
      cities: new Set(trips.map((trip) => `${trip.countryCode}:${trip.cityCode}`)).size,
      trips: trips.length,
      places: trips.reduce((sum, trip) => sum + trip.places.length, 0),
      days: trips.reduce((sum, trip) => sum + Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1), 0),
      expenses: trips.flatMap((trip) => trip.expenses).reduce((sum, expense) => sum + expense.amount, 0),
    };
  });
  readonly visitedCountryCount = computed(() => new Set(this.continentTrips().map((trip) => trip.countryCode)).size);
  readonly countryTrips = computed(() => {
    const country = this.country();
    return country ? this.store.trips().filter((trip) => trip.countryCode === country.code) : [];
  });
  readonly progress = computed(() => Math.round(this.visitedCountryCount() / this.countries().length * 100));
  readonly latestTrips = computed(() => [...this.continentTrips()].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 3));
  readonly filteredCountries = computed(() => {
    const query = this.countrySearch().trim().toLowerCase();
    if (!query) return this.countries();
    return this.countries().filter((country) =>
      country.name.toLowerCase().includes(query) ||
      country.code.toLowerCase().includes(query) ||
      country.cities.some((city) => city.name.toLowerCase().includes(query))
    );
  });
  readonly countryByCode = countryByCode;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const next = continentByCode(params.get('continentCode') ?? 'AS').code;
      const selected = this.selectedCountry() ? countryByCode(this.selectedCountry()!) : undefined;
      this.continentCode.set(next);
      const pending = this.pendingCountryCode ? countryByCode(this.pendingCountryCode) : undefined;
      this.selectedCountry.set(pending?.continentCode === next ? pending.code : selected?.continentCode === next ? selected.code : null);
      this.pendingCountryCode = null;
    });
  }

  selectContinent(code: ContinentCode): void {
    this.selectedCountry.set(null);
    this.clearCountrySearch();
    if (code !== this.continentCode()) this.continentCode.set(code);
    void this.router.navigate(['/continent', code]);
  }
  selectCountry(code: string): void {
    this.pendingCountryCode = null;
    this.selectedCountry.set(this.countries().some((country) => country.code === code) ? code : null);
    this.clearCountrySearch();
  }
  selectCountryFromSearch(code: string): void { this.selectCountry(code); }
  selectFirstCountryMatch(): void { const first = this.filteredCountries()[0]; if (first) this.selectCountryFromSearch(first.code); }
  closeCountrySearchSoon(): void { window.setTimeout(() => this.countrySearchOpen.set(false), 120); }
  flagIconPath(code: string): string { return `/assets/flags/4x3/${code.toLowerCase()}.svg`; }
  backToContinent(): void { this.selectedCountry.set(null); }
  openCity(event: { countryCode: string; cityCode: string }): void { void this.router.navigate(['/city', event.countryCode, event.cityCode]); }
  async saveTrip(trip: Trip): Promise<void> {
    await this.store.save(trip);
    this.editorOpen.set(false);
    this.showCountry(trip.countryCode);
    this.flash('Journey saved - your map has been updated');
  }
  smartImportCreated(trip: Trip): void {
    this.photoImporterOpen.set(false);
    this.showCountry(trip.countryCode);
    this.flash(`${trip.mediaIds.length} photos analyzed - journey created`);
  }
  async exportData(): Promise<void> {
    const content = JSON.stringify(await this.store.document(), null, 2); const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'travel-atlas-backup.json'; link.click(); URL.revokeObjectURL(url); this.flash('Backup exported');
  }
  async importData(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    try { await this.store.import(JSON.parse(await file.text()) as TravelDocument); this.flash('Backup imported successfully'); }
    catch { this.flash('This backup could not be imported'); } finally { input.value = ''; }
  }
  async loadDemo(): Promise<void> {
    if (this.store.trips().length && !confirm('Replace current trip data with the Beijing demo? Photos will be kept.')) return;
    await this.store.import({ schemaVersion: 1, profile: { displayName: 'My Atlas' }, trips: [this.demoTrip()] }); this.showCountry('CN'); this.flash('Beijing demo is ready to explore');
  }
  async reset(): Promise<void> {
    if (!confirm('Reset all trips and photos stored in this browser? This cannot be undone.')) return;
    await this.store.reset(); await this.media.clear(); this.selectedCountry.set(null); this.flash('Your local atlas has been reset');
  }
  private flash(message: string): void { this.toast.set(message); window.setTimeout(() => this.toast.set(''), 2800); }
  private clearCountrySearch(): void { this.countrySearch.set(''); this.countrySearchOpen.set(false); }
  private showCountry(code: string): void {
    const country = countryByCode(code);
    if (!country) { this.selectedCountry.set(null); return; }
    if (country.continentCode !== this.continentCode()) {
      this.pendingCountryCode = country.code;
      this.continentCode.set(country.continentCode);
      void this.router.navigate(['/continent', country.continentCode]);
      return;
    }
    this.selectedCountry.set(country.code);
  }
  private demoTrip(): Trip {
    const now = new Date().toISOString(); return { id: 'demo-beijing-2026', name: 'Beijing 2026', countryCode: 'CN', cityCode: 'BEIJING', startDate: '2026-10-29', endDate: '2026-11-04', description: 'Seven autumn days discovering imperial Beijing and the Great Wall.', notes: 'Cold, clear mornings. The city felt enormous, but every courtyard had a quiet story.', transport: 'Flight to PEK - Metro - Didi', hotel: 'Sanlitun boutique hotel', restaurant: 'Siji Minfu Peking Duck', ticket: 'Forbidden City - Universal Beijing', route: 'PEK Airport -> Lama Temple -> Sanlitun -> Beihai Park -> Forbidden City -> Mutianyu', rating: 5, tags: ['culture','food','architecture'], createdAt: now, updatedAt: now, mediaIds: [], expenses: [
      { id: crypto.randomUUID(), type: 'Transport', amount: 12400, currency: 'THB', note: 'Flights and local transport' }, { id: crypto.randomUUID(), type: 'Hotel', amount: 18600, currency: 'THB', note: '6 nights' }, { id: crypto.randomUUID(), type: 'Restaurant', amount: 7240, currency: 'THB' }, { id: crypto.randomUUID(), type: 'Ticket', amount: 4680, currency: 'THB' },
    ], places: [
      ['Lama Temple',39.9474,116.4173,'2026-10-29','Incense and red walls in the morning'], ['Mutianyu Great Wall',40.4319,116.5704,'2026-10-30','Cable car up and slide down'], ['Forbidden City',39.9163,116.3972,'2026-10-31','Endless courtyards under a blue sky'], ['Temple of Heaven',39.8822,116.4066,'2026-11-01','Local people exercising in the park'], ['Summer Palace',39.9999,116.2755,'2026-11-02','Golden-hour walk beside Kunming Lake'], ['Universal Beijing',39.8557,116.6743,'2026-11-03','A playful final full day'], ['Beihai Park',39.9255,116.388,'2026-11-04','Quiet farewell walk by the lake']
    ].map(([name, latitude, longitude, visitedAt, note]) => ({ id: crypto.randomUUID(), name: name as string, latitude: latitude as number, longitude: longitude as number, visitedAt: visitedAt as string, note: note as string, rating: 5 })) };
  }
}
