import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { COUNTRY_CATALOG, CountryOption } from '../../../core/data/asia-catalog';
import { Trip } from '../../../core/models/travel.models';
import { CHINA_PROVINCES, chinaProvinceByCode, primaryProvinceForTrip, provinceForCity } from '../../../core/data/china-provinces';
import { THAILAND_PROVINCES, thaiProvinceByCode, primaryThaiProvinceForTrip, thaiProvinceForCity } from '../../../core/data/thailand-provinces';

@Component({ selector: 'trip-editor', standalone: true, imports: [FormsModule, CommonModule], templateUrl: './trip-editor.html', styleUrl: './trip-editor.css' })
export class TripEditor implements OnChanges {
  @Input() trip: Trip | null = null; @Output() saved = new EventEmitter<Trip>(); @Output() cancelled = new EventEmitter<void>();
  @Input() presetCountryCode = ''; @Input() presetCityCode = '';
  @Input() presetProvinceCode = '';
  readonly chinaProvinces = CHINA_PROVINCES;
  get availableProvinces() { return this.model.countryCode === 'TH' ? THAILAND_PROVINCES : this.chinaProvinces; }
  private provinceByCode(code?: string) { return this.model.countryCode === 'TH' ? thaiProvinceByCode(code) : chinaProvinceByCode(code); }
  private provinceForCity(city?: string): string | undefined { return this.model.countryCode === 'TH' ? thaiProvinceForCity(city) : provinceForCity(city); }
  private provinceChosenManually = false;
  @Input() countries: readonly CountryOption[] = COUNTRY_CATALOG; model!: Trip; selectedCountry!: CountryOption;
  countryQuery = ''; countryMenuOpen = false; cityText = ''; readonly ratingValues = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  ngOnChanges(): void {
    const now = new Date().toISOString(); const today = now.slice(0, 10); const first = this.countries.find((country) => country.code === 'TH') ?? this.countries[0] ?? COUNTRY_CATALOG[0];
    const presetCountry = this.countries.find((country) => country.code === this.presetCountryCode) ?? first;
    this.model = this.trip ? structuredClone(this.trip) : { id: crypto.randomUUID(), name: '', countryCode: presetCountry.code, cityCode: presetCountry.cities.some((city) => city.code === this.presetCityCode) ? this.presetCityCode : presetCountry.cities[0].code, startDate: today, endDate: today, description: '', notes: '', transport: '', hotel: '', restaurant: '', ticket: '', route: '', rating: 0, tags: [], places: [], expenses: [], mediaIds: [], createdAt: now, updatedAt: now };
    this.selectedCountry = this.countries.find((country) => country.code === this.model.countryCode) ?? first;
    this.cityText = this.selectedCountry.cities.find((city) => city.code === this.model.cityCode)?.name ?? this.model.cityName ?? this.model.cityCode.replace(/_/g, ' ');
    if (this.model.countryCode === 'CN' || this.model.countryCode === 'TH') {
      this.model.provinceCode = (this.model.countryCode === 'TH' ? primaryThaiProvinceForTrip(this.model) : primaryProvinceForTrip(this.model)) ?? this.provinceByCode(this.presetProvinceCode)?.code;
    }
    this.provinceChosenManually = !!(this.trip?.provinceCode || this.presetProvinceCode);
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
    this.model.provinceCode = country.code === 'CN' || country.code === 'TH' ? this.provinceForCity(this.cityText) : undefined;
    this.provinceChosenManually = false;
  }
  updateCityProvince(): void {
    if (this.model.countryCode === 'CN' || this.model.countryCode === 'TH') {
      const inferred = this.provinceForCity(this.cityText);
      if (inferred) {
        this.model.provinceCode = inferred;
        this.provinceChosenManually = false;
      } else if (!this.provinceChosenManually) {
        this.model.provinceCode = undefined;
      }
    }
  }
  selectProvince(): void {
    const province = this.provinceByCode(this.model.provinceCode);
    this.provinceChosenManually = !!province;
    const currentCityProvince = this.provinceForCity(this.cityText);
    if (province && currentCityProvince && currentCityProvince !== province.code) {
      this.cityText = province.capital;
    }
  }
  ratingPercent(value: number): number { return Math.max(0, Math.min(100, (value / 5) * 100)); }
  private cityCodeFromText(): string {
    const cityName = this.cityText.trim();
    const matched = this.selectedCountry.cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase() || city.code.toLowerCase() === cityName.toLowerCase());
    if (matched) return matched.code;
    return cityName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || this.selectedCountry.cities[0]?.code || 'CITY';
  }
  submit(): void {
    const cityName = this.cityText.trim();
    this.model.cityCode = this.cityCodeFromText();
    this.model.cityName = this.selectedCountry.cities.find((city) => city.code === this.model.cityCode)?.name ?? cityName;
    this.model.provinceCode = this.model.countryCode === 'CN' || this.model.countryCode === 'TH'
      ? this.provinceByCode(this.model.provinceCode)?.code ?? this.provinceForCity(this.model.cityCode) ?? this.provinceForCity(cityName)
      : undefined;
    this.model.tags = this.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean); this.saved.emit(this.model);
  }
  get tagsText(): string { return this.model.tags.join(', '); } set tagsText(value: string) { this.model.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean); }
}
