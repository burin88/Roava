import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnDestroy, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COUNTRY_CATALOG, CountryOption } from '../../../core/data/asia-catalog';
import { PhotoAnalysisProvider, PhotoTripAnalysis } from '../../../core/analysis/photo-analysis-provider';
import { Trip } from '../../../core/models/travel.models';
import { OcrProgress, OcrProvider, OcrScanResult } from '../../../core/ocr/ocr-provider';
import { MediaStorage } from '../../../core/storage/media-storage';
import { TravelStore } from '../../../core/state/travel-store';

interface PendingPhoto { file: File; url: string; }
type ImportPhase = 'select' | 'scanning' | 'review' | 'saving' | 'error';

@Component({ selector: 'photo-importer', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './photo-importer.html', styleUrl: './photo-importer.css' })
export class PhotoImporter implements OnDestroy {
  private readonly ocr = inject(OcrProvider); private readonly analyzer = inject(PhotoAnalysisProvider); private readonly media = inject(MediaStorage); private readonly store = inject(TravelStore);
  @Input() presetCountryCode = ''; @Input() presetCityCode = ''; @Input() countries: readonly CountryOption[] = COUNTRY_CATALOG; @Output() cancelled = new EventEmitter<void>(); @Output() created = new EventEmitter<Trip>();
  readonly photos = signal<PendingPhoto[]>([]); readonly phase = signal<ImportPhase>('select'); readonly progress = signal<OcrProgress | null>(null); readonly scans = signal<OcrScanResult[]>([]); readonly error = signal('');
  draft: PhotoTripAnalysis | null = null; selectedCountry: CountryOption = COUNTRY_CATALOG.find((country) => country.code === 'TH')!;

  choose(event: Event): void {
    const input = event.target as HTMLInputElement; const incoming = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, 30);
    this.clearUrls(); this.photos.set(incoming.map((file) => ({ file, url: URL.createObjectURL(file) }))); this.phase.set('select'); this.error.set(''); input.value = '';
  }
  remove(index: number): void { const items = [...this.photos()]; URL.revokeObjectURL(items[index].url); items.splice(index, 1); this.photos.set(items); }
  async scan(): Promise<void> {
    const files = this.photos().map((photo) => photo.file); if (!files.length) return;
    this.phase.set('scanning'); this.progress.set({ currentFile: 1, totalFiles: files.length, fileName: files[0].name, status: 'Preparing local OCR', progress: 0 });
    try {
      const results = await this.ocr.recognize(files, (progress) => this.progress.set(progress)); this.scans.set(results);
      const analysis = this.analyzer.analyze(results, []);
      if (this.presetCountryCode && !results.some((result) => result.text.trim())) { analysis.countryCode = this.presetCountryCode; analysis.cityCode = this.presetCityCode || this.countries.find((item) => item.code === this.presetCountryCode)?.cities[0]?.code || analysis.cityCode; }
      this.draft = analysis; this.selectedCountry = this.countries.find((country) => country.code === analysis.countryCode) ?? this.countries[0];
      if (!this.selectedCountry.cities.some((city) => city.code === analysis.cityCode)) analysis.cityCode = this.selectedCountry.cities[0].code;
      this.phase.set('review');
    } catch (cause) {
      console.error('Local OCR failed', cause); this.error.set('OCR ไม่สำเร็จ กรุณาตรวจว่าไฟล์เป็นรูปภาพที่อ่านได้ แล้วลองใหม่อีกครั้ง'); this.phase.set('error');
    }
  }
  countryChanged(): void { if (!this.draft) return; this.selectedCountry = this.countries.find((country) => country.code === this.draft!.countryCode)!; this.draft.cityCode = this.selectedCountry.cities[0].code; }
  async save(): Promise<void> {
    if (!this.draft) return; this.phase.set('saving'); const now = new Date().toISOString(); const city = this.selectedCountry.cities.find((item) => item.code === this.draft!.cityCode) ?? this.selectedCountry.cities[0];
    const trip: Trip = { id: crypto.randomUUID(), name: this.draft.name.trim() || `${city.name} ${new Date(this.draft.startDate).getFullYear()}`, countryCode: this.draft.countryCode, cityCode: this.draft.cityCode, startDate: this.draft.startDate, endDate: this.draft.endDate || this.draft.startDate, description: this.draft.description, notes: this.draft.notes, tags: this.draft.tags, places: this.draft.places.filter((place) => place.selected).map((place) => ({ id: crypto.randomUUID(), name: place.name, visitedAt: place.visitedAt || this.draft!.startDate, latitude: city.coordinates[1], longitude: city.coordinates[0], note: `Detected from OCR: ${place.evidence}`, rating: 0, tags: ['ocr'] })), expenses: this.draft.expenses.filter((expense) => expense.selected).map((expense) => ({ id: crypto.randomUUID(), type: expense.type, amount: expense.amount, currency: expense.currency, note: expense.note, spentAt: this.draft!.startDate })), mediaIds: [], createdAt: now, updatedAt: now };
    try {
      const records = await Promise.all(this.photos().map((photo) => this.media.save(photo.file, trip.id))); trip.mediaIds = records.map((record) => record.id); await this.store.save(trip); this.created.emit(trip);
    } catch (cause) {
      console.error('Smart photo import failed', cause); this.error.set('บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'); this.phase.set('error');
    }
  }
  backToSelect(): void { this.phase.set('select'); }
  overallProgress(): number { const value = this.progress(); if (!value) return 0; return Math.round((((value.currentFile - 1) + value.progress) / value.totalFiles) * 100); }
  trackPhoto(index: number): number { return index; }
  get tagsText(): string { return this.draft?.tags.join(', ') ?? ''; }
  set tagsText(value: string) { if (this.draft) this.draft.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean); }
  ngOnDestroy(): void { this.clearUrls(); }
  private clearUrls(): void { this.photos().forEach((photo) => URL.revokeObjectURL(photo.url)); }
}
