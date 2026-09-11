import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { continentByCode, countriesByContinent, countryByCode, cityByCode } from '../../../core/data/asia-catalog';
import { Expense, ExpenseType, Place, Trip } from '../../../core/models/travel.models';
import { MediaStorage } from '../../../core/storage/media-storage';
import { SummaryProvider } from '../../../core/summary/summary-provider';
import { TravelStore } from '../../../core/state/travel-store';
import { TripEditor } from '../../trips/trip-editor/trip-editor';
import { PhotoImporter } from '../../media/photo-importer/photo-importer';

interface PhotoView { id: string; url: string; name: string; objectUrl: boolean; }
interface PendingPlacePhoto { file: File; url: string; }
interface PlaceDayGroup { date: string; places: Place[]; }
type TimeFormat = '24h' | '12h';

@Component({ selector: 'city-memory', standalone: true, imports: [CommonModule, FormsModule, RouterLink, DatePipe, DecimalPipe, TripEditor, PhotoImporter], templateUrl: './city-memory.html', styleUrl: './city-memory.css' })
export class CityMemory implements OnDestroy {
  readonly store = inject(TravelStore); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router); private readonly media = inject(MediaStorage); readonly summaries = inject(SummaryProvider);
  readonly countryCode = signal(''); readonly cityCode = signal(''); readonly editorOpen = signal(false); readonly photoImporterOpen = signal(false); readonly editingTrip = signal<Trip | null>(null); readonly selectedTripId = signal('');
  readonly placeEditorOpen = signal(false); readonly placeGallery = signal<Place | null>(null); readonly collapsedPlaceDays = signal<Set<string>>(new Set()); readonly expenseEditorOpen = signal(false); readonly expenseCategoryOpen = signal(false); readonly expenseCategoryQuery = signal(''); readonly photoViews = signal<PhotoView[]>([]); readonly photoBusy = signal(false); readonly photoError = signal(''); readonly toast = signal('');
  private photoLoadId = 0;
  placeTimeFormat: TimeFormat = '24h'; placeHour24 = 12; placeMinute24 = 0; placeHour12 = '12'; placeMinute12 = '00'; placeMeridiem: 'AM' | 'PM' = 'PM';
  placePendingPhotos: PendingPlacePhoto[] = []; placeExistingPhotos: PhotoView[] = []; placeRemovedMediaIds = new Set<string>(); placePhotoBusy = false; placePhotoError = '';
  placeModel: Place = this.newPlace(); expenseModel: Expense = this.newExpense();
  readonly country = computed(() => countryByCode(this.countryCode())); readonly city = computed(() => cityByCode(this.countryCode(), this.cityCode()));
  readonly continent = computed(() => continentByCode(this.country()?.continentCode ?? 'AS'));
  readonly continentCountries = computed(() => countriesByContinent(this.continent().code));
  readonly trips = computed(() => this.store.trips().filter((trip) => trip.countryCode === this.countryCode() && trip.cityCode === this.cityCode()).sort((a, b) => b.startDate.localeCompare(a.startDate)));
  readonly currentCityName = computed(() => this.city()?.name ?? this.trips()[0]?.cityName ?? this.cityCode().replace(/_/g, ' '));
  readonly selectedTrip = computed(() => this.trips().find((trip) => trip.id === this.selectedTripId()) ?? this.trips()[0] ?? null);
  readonly cityStats = computed(() => ({ trips: this.trips().length, days: this.trips().reduce((sum, trip) => sum + this.days(trip), 0), places: this.trips().flatMap((trip) => trip.places).length, photos: this.trips().reduce((sum, trip) => sum + trip.mediaIds.length, 0), expenses: this.trips().flatMap((trip) => trip.expenses).reduce((sum, expense) => sum + expense.amount, 0) }));
  readonly expenseTypes: ExpenseType[] = ['Transport','Hotel','Restaurant','Ticket','Shopping','Other'];
  readonly placeRatingValues = [1, 2, 3, 4, 5] as const;
  readonly filteredExpenseTypes = computed(() => {
    const query = this.expenseCategoryQuery().trim().toLowerCase();
    return query ? this.expenseTypes.filter((type) => type.toLowerCase().includes(query)) : this.expenseTypes;
  });

  constructor() {
    this.route.paramMap.subscribe((params) => { this.countryCode.set(params.get('countryCode') ?? ''); this.cityCode.set(params.get('cityCode') ?? ''); this.selectedTripId.set(''); });
    effect(() => { const trip = this.selectedTrip(); void this.loadPhotos(trip); });
  }
  days(trip: Trip): number { return Math.max(1, Math.round((Date.parse(trip.endDate)-Date.parse(trip.startDate))/86400000)+1); }
  flagIconPath(code: string): string { return `/assets/flags/4x3/${code.toLowerCase()}.svg`; }
  tripExpense(trip: Trip): number { return trip.expenses.reduce((sum, item) => sum + item.amount, 0); }
  placeDayGroups(trip: Trip): PlaceDayGroup[] { const groups = new Map<string, Place[]>(); for (const place of trip.places) { const date = place.visitedAt || ''; groups.set(date, [...(groups.get(date) ?? []), place]); } return [...groups].map(([date, places]) => ({ date, places })).sort((a, b) => a.date.localeCompare(b.date)); }
  togglePlaceDay(date: string): void { this.collapsedPlaceDays.update((current) => { const next = new Set(current); next.has(date) ? next.delete(date) : next.add(date); return next; }); }
  isPlaceDayCollapsed(date: string): boolean { return this.collapsedPlaceDays().has(date); }
  placeNumber(trip: Trip, place: Place): number { return trip.places.findIndex((item) => item.id === place.id) + 1; }
  photosForPlace(place: Place): PhotoView[] { const ids = new Set(place.mediaIds ?? []); return this.photoViews().filter((photo) => ids.has(photo.id)); }
  journeyPhotoPreview(place: Place): PhotoView[] { return this.photosForPlace(place).slice(0, 4); }
  remainingPlacePhotos(place: Place): number { return Math.max(0, this.photosForPlace(place).length - 4); }
  openPlaceGallery(place: Place): void { if (this.photosForPlace(place).length) this.placeGallery.set(place); }
  selectTrip(trip: Trip): void { this.selectedTripId.set(trip.id); }
  openTripEditor(trip: Trip | null = null): void { this.editingTrip.set(trip); this.editorOpen.set(true); }
  async saveTrip(trip: Trip): Promise<void> { await this.store.save(trip); this.selectedTripId.set(trip.id); this.editorOpen.set(false); this.flash('Journey saved'); }
  smartImportCreated(trip: Trip): void { this.photoImporterOpen.set(false); if (trip.countryCode === this.countryCode() && trip.cityCode === this.cityCode()) this.selectedTripId.set(trip.id); else void this.router.navigate(['/city', trip.countryCode, trip.cityCode]); this.flash(`${trip.mediaIds.length} photos analyzed`); }
  async deleteTrip(trip: Trip): Promise<void> {
    if (!confirm(`Delete “${trip.name}” and its locally stored photos?`)) return;
    await Promise.all(trip.mediaIds.map((id) => this.media.delete(id))); await this.store.delete(trip.id); this.flash('Journey deleted');
    if (!this.trips().length) void this.router.navigate(['/continent', this.continent().code]);
  }
  openPlace(place?: Place): void {
    this.clearPlacePhotoDraft(); this.placeModel = place ? structuredClone(place) : this.newPlace(); this.placeModel.mediaIds ??= [];
    this.sync24HourFields(); this.sync12HourTime(); this.placeEditorOpen.set(true); void this.loadPlacePhotos();
  }
  closePlaceEditor(): void { this.clearPlacePhotoDraft(); this.placeEditorOpen.set(false); }
  setPlaceTimeFormat(format: TimeFormat): void { if (format === this.placeTimeFormat) return; if (format === '12h') { this.update24HourTime(); this.sync12HourTime(); } else { this.sync24HourTime(); this.sync24HourFields(); } this.placeTimeFormat = format; }
  update24HourTime(): void { this.placeHour24 = Math.max(0, Math.min(23, Number(this.placeHour24) || 0)); this.placeMinute24 = Math.max(0, Math.min(59, Number(this.placeMinute24) || 0)); this.placeModel.time = `${String(this.placeHour24).padStart(2, '0')}:${String(this.placeMinute24).padStart(2, '0')}`; }
  inferredMeridiem(): 'AM' | 'PM' { return this.placeHour24 >= 12 ? 'PM' : 'AM'; }
  update12HourTime(): void { this.sync24HourTime(); }
  addPlacePhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files ?? [])) this.placePendingPhotos.push({ file, url: URL.createObjectURL(file) });
    input.value = '';
  }
  removePendingPlacePhoto(photo: PendingPlacePhoto): void { URL.revokeObjectURL(photo.url); this.placePendingPhotos = this.placePendingPhotos.filter((item) => item !== photo); }
  removeExistingPlacePhoto(photo: PhotoView): void { this.placeRemovedMediaIds.add(photo.id); this.placeExistingPhotos = this.placeExistingPhotos.filter((item) => item.id !== photo.id); }
  setPlaceRating(rating: number): void { this.placeModel.rating = this.placeModel.rating === rating ? 0 : rating; }
  async savePlace(): Promise<void> {
    const trip = this.selectedTrip(); if (!trip || this.placePhotoBusy) return; this.placePhotoBusy = true; this.placePhotoError = '';
    try {
      if (this.placeTimeFormat === '12h') this.sync24HourTime(); else this.update24HourTime();
      const saved = await Promise.all(this.placePendingPhotos.map((photo) => this.media.save(photo.file, trip.id, this.placeModel.id)));
      const retainedIds = (this.placeModel.mediaIds ?? []).filter((id) => !this.placeRemovedMediaIds.has(id));
      this.placeModel.mediaIds = [...retainedIds, ...saved.map((item) => item.id)];
      const updated = structuredClone(trip); const index = updated.places.findIndex((place) => place.id === this.placeModel.id);
      if (index >= 0) updated.places[index] = this.placeModel; else updated.places.push(this.placeModel);
      updated.mediaIds = [...new Set([...updated.mediaIds.filter((id) => !this.placeRemovedMediaIds.has(id)), ...saved.map((item) => item.id)])];
      await this.store.save(updated); await Promise.all([...this.placeRemovedMediaIds].map((id) => this.media.delete(id)));
      this.closePlaceEditor(); this.flash('Place and photos saved');
    } catch (cause) { console.error('Place photo upload failed', cause); this.placePhotoError = cause instanceof Error ? cause.message : 'Photos could not be saved'; }
    finally { this.placePhotoBusy = false; }
  }
  async deletePlace(place: Place): Promise<void> { const trip = this.selectedTrip(); if (!trip || !confirm(`Remove ${place.name}?`)) return; const mediaIds = place.mediaIds ?? []; await Promise.all(mediaIds.map((id) => this.media.delete(id))); await this.store.save({ ...trip, places: trip.places.filter((item) => item.id !== place.id), mediaIds: trip.mediaIds.filter((id) => !mediaIds.includes(id)) }); this.flash('Place removed'); }
  openExpense(expense?: Expense): void { this.expenseModel = expense ? structuredClone(expense) : this.newExpense(); this.expenseCategoryQuery.set(this.expenseModel.type); this.expenseCategoryOpen.set(false); this.expenseEditorOpen.set(true); }
  selectExpenseType(type: ExpenseType): void { this.expenseModel.type = type; this.expenseCategoryQuery.set(type); this.expenseCategoryOpen.set(false); }
  expenseTypeIcon(type: ExpenseType): string { return type === 'Transport' ? '✈' : type === 'Hotel' ? '⌂' : type === 'Restaurant' ? '♨' : type === 'Ticket' ? '◇' : type === 'Shopping' ? '▣' : '••'; }
  closeExpenseCategorySoon(): void { window.setTimeout(() => this.expenseCategoryOpen.set(false), 120); }
  async saveExpense(): Promise<void> { const trip = this.selectedTrip(); if (!trip) return; this.expenseModel.currency = this.expenseModel.currency.trim().toUpperCase() || 'THB'; const updated = structuredClone(trip); const index = updated.expenses.findIndex((expense) => expense.id === this.expenseModel.id); if (index >= 0) updated.expenses[index] = this.expenseModel; else updated.expenses.push(this.expenseModel); await this.store.save(updated); this.expenseEditorOpen.set(false); this.flash('Expense saved'); }
  async deleteExpense(expense: Expense): Promise<void> { const trip = this.selectedTrip(); if (!trip) return; await this.store.save({ ...trip, expenses: trip.expenses.filter((item) => item.id !== expense.id) }); this.flash('Expense removed'); }
  async uploadPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const trip = this.selectedTrip(); const files = Array.from(input.files ?? []); if (!trip || !files.length) return;
    this.photoBusy.set(true); this.photoError.set('');
    try {
      const saved = await Promise.all(files.map((file) => this.media.save(file, trip.id)));
      const updated = { ...trip, mediaIds: [...trip.mediaIds, ...saved.map((item) => item.id)] };
      await this.store.save(updated); await this.loadPhotos(updated); input.value = '';
      this.flash(`${saved.length} photo${saved.length > 1 ? 's' : ''} saved to img/travel-photos`);
    } catch (cause) {
      console.error('Photo upload failed', cause); this.photoError.set(cause instanceof Error ? cause.message : 'Photo upload failed');
    } finally { this.photoBusy.set(false); }
  }
  async deletePhoto(photo: PhotoView): Promise<void> {
    const trip = this.selectedTrip(); if (!trip) return; this.photoBusy.set(true); this.photoError.set('');
    try {
      await this.media.delete(photo.id); const updated = { ...trip, mediaIds: trip.mediaIds.filter((id) => id !== photo.id) };
      await this.store.save(updated); await this.loadPhotos(updated); this.flash('Photo removed from img/travel-photos');
    } catch (cause) {
      console.error('Photo deletion failed', cause); this.photoError.set(cause instanceof Error ? cause.message : 'Photo deletion failed');
    } finally { this.photoBusy.set(false); }
  }
  private async loadPhotos(trip: Trip | null): Promise<void> {
    const loadId = ++this.photoLoadId;
    if (!trip) { this.clearPhotoViews(); return; }
    try {
      const records = await Promise.all(trip.mediaIds.map((id) => this.media.getRecord(id)));
      if (loadId !== this.photoLoadId) return;
      const next = records.filter((item) => !!item).flatMap((item) => {
        const directUrl = item!.thumbnailUrl ?? item!.url;
        if (directUrl) return [{ id: item!.id, url: directUrl, name: item!.fileName, objectUrl: false }];
        const blob = item!.thumbnailBlob ?? item!.blob;
        return blob ? [{ id: item!.id, url: URL.createObjectURL(blob), name: item!.fileName, objectUrl: true }] : [];
      });
      this.clearPhotoViews(); this.photoViews.set(next); this.photoError.set('');
    } catch (cause) {
      if (loadId === this.photoLoadId) this.photoError.set(cause instanceof Error ? cause.message : 'Photos could not be loaded');
    }
  }
  private clearPhotoViews(): void { this.photoViews().filter((photo) => photo.objectUrl).forEach((photo) => URL.revokeObjectURL(photo.url)); this.photoViews.set([]); }
  ngOnDestroy(): void { this.photoLoadId++; this.clearPhotoViews(); this.clearPlacePhotoDraft(); }
  private newPlace(): Place { const trip = this.selectedTrip?.(); return { id: crypto.randomUUID(), name: '', latitude: this.city?.()?.coordinates[1] ?? 0, longitude: this.city?.()?.coordinates[0] ?? 0, visitedAt: trip?.startDate ?? new Date().toISOString().slice(0,10), time: '', description: '', note: '', rating: 0, tags: [] }; }
  private newExpense(): Expense { return { id: crypto.randomUUID(), type: 'Other', amount: 0, currency: 'THB', note: '', spentAt: this.selectedTrip?.()?.startDate ?? new Date().toISOString().slice(0,10) }; }
  private sync12HourTime(): void { const [hourText = '12', minute = '00'] = (this.placeModel.time || '12:00').split(':'); const hour = Number(hourText); this.placeHour12 = String(hour % 12 || 12).padStart(2, '0'); this.placeMinute12 = minute; this.placeMeridiem = hour >= 12 ? 'PM' : 'AM'; }
  private sync24HourTime(): void { let hour = Number(this.placeHour12) % 12; if (this.placeMeridiem === 'PM') hour += 12; this.placeModel.time = `${String(hour).padStart(2, '0')}:${this.placeMinute12}`; }
  private sync24HourFields(): void { const [hour = '12', minute = '00'] = (this.placeModel.time || '12:00').split(':'); this.placeHour24 = Number(hour); this.placeMinute24 = Number(minute); }
  private async loadPlacePhotos(): Promise<void> { const records = await Promise.all((this.placeModel.mediaIds ?? []).map((id) => this.media.getRecord(id))); if (!this.placeEditorOpen()) return; this.placeExistingPhotos = records.filter((item) => !!item).map((item) => ({ id: item!.id, url: item!.thumbnailUrl ?? item!.url ?? URL.createObjectURL(item!.thumbnailBlob ?? item!.blob!), name: item!.fileName, objectUrl: !item!.thumbnailUrl && !item!.url })); }
  private clearPlacePhotoDraft(): void { this.placePendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.url)); this.placeExistingPhotos.filter((photo) => photo.objectUrl).forEach((photo) => URL.revokeObjectURL(photo.url)); this.placePendingPhotos = []; this.placeExistingPhotos = []; this.placeRemovedMediaIds.clear(); this.placePhotoError = ''; }
  private flash(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 2500); }
}
