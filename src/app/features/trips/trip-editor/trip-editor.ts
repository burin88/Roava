import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { COUNTRY_CATALOG, CountryOption } from '../../../core/data/asia-catalog';
import { Trip } from '../../../core/models/travel.models';

@Component({ selector: 'trip-editor', standalone: true, imports: [FormsModule, CommonModule], templateUrl: './trip-editor.html', styleUrl: './trip-editor.css' })
export class TripEditor implements OnChanges {
  @Input() trip: Trip | null = null; @Output() saved = new EventEmitter<Trip>(); @Output() cancelled = new EventEmitter<void>();
  @Input() presetCountryCode = ''; @Input() presetCityCode = '';
  @Input() countries: readonly CountryOption[] = COUNTRY_CATALOG; model!: Trip; selectedCountry!: CountryOption;
  countryQuery = ''; countryMenuOpen = false; cityText = ''; readonly ratingValues = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  ngOnChanges(): void {
    const now = new Date().toISOString(); const today = now.slice(0, 10); const first = this.countries.find((country) => country.code === 'TH') ?? this.countries[0] ?? COUNTRY_CATALOG[0];
    const presetCountry = this.countries.find((country) => country.code === this.presetCountryCode) ?? first;
    this.model = this.trip ? structuredClone(this.trip) : { id: crypto.randomUUID(), name: '', countryCode: presetCountry.code, cityCode: presetCountry.cities.some((city) => city.code === this.presetCityCode) ? this.presetCityCode : presetCountry.cities[0].code, startDate: today, endDate: today, description: '', notes: '', transport: '', hotel: '', restaurant: '', ticket: '', route: '', rating: 0, tags: [], places: [], expenses: [], mediaIds: [], createdAt: now, updatedAt: now };
    this.selectedCountry = this.countries.find((country) => country.code === this.model.countryCode) ?? first;
    this.cityText = this.selectedCountry.cities.find((city) => city.code === this.model.cityCode)?.name ?? this.model.cityName ?? this.model.cityCode.replace(/_/g, ' ');
    this.countryQuery = ''; this.countryMenuOpen = false;
  }
  filteredCountries(): readonly CountryOption[] {
    const query = this.countryQuery.trim().toLowerCase();
    if (!query) return this.countries;
    return this.countries.filter((country) => `${country.name} ${country.code}`.toLowerCase().includes(query));
  }
  flagIconPath(code: string): string { return `/assets/flags/4x3/${code.toLowerCase()}.svg`; }
  selectCountry(country: CountryOption): void {
    this.selectedCountry = country; this.model.countryCode = country.code; this.countryMenuOpen = false; this.countryQuery = '';
    const stillValid = country.cities.some((city) => city.name.toLowerCase() === this.cityText.trim().toLowerCase() || city.code === this.model.cityCode);
    if (!stillValid) this.cityText = country.cities[0]?.name ?? '';
  }
  ratingPercent(value: number): number { return Math.max(0, Math.min(100, (value / 5) * 100)); }
  private cityCodeFromText(): string {
    const cityName = this.cityText.trim();
    const matched = this.selectedCountry.cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase() || city.code.toLowerCase() === cityName.toLowerCase());
    if (matched) return matched.code;
    return cityName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || this.selectedCountry.cities[0]?.code || 'CITY';
  }
  submit(): void {
    const cityName = this.cityText.trim();
    this.model.cityCode = this.cityCodeFromText();
    this.model.cityName = this.selectedCountry.cities.find((city) => city.code === this.model.cityCode)?.name ?? cityName;
    this.model.tags = this.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean); this.saved.emit(this.model);
  }
  get tagsText(): string { return this.model.tags.join(', '); } set tagsText(value: string) { this.model.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean); }
}
