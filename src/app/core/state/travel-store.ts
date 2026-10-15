import { computed, inject, Injectable, signal } from '@angular/core';
import { TravelRepository } from '../storage/travel-repository';
import { TravelDocument, Trip } from '../models/travel.models';
import { countTravelDays } from '../models/travel-days';

@Injectable({ providedIn: 'root' })
export class TravelStore {
  private readonly repository = inject(TravelRepository);
  readonly trips = signal<Trip[]>([]);
  readonly ready = signal(false);
  private chinaPlanImport?: Promise<number>;
  readonly visitedCountries = computed(() => new Set(this.trips().map((trip) => trip.countryCode)));
  readonly visitedCities = computed(() => new Set(this.trips().map((trip) => `${trip.countryCode}:${trip.cityCode}`)));
  readonly stats = computed(() => {
    const trips = this.trips();
    const days = countTravelDays(trips);
    const places = trips.flatMap((trip) => trip.places);
    const points = places.filter((place) => typeof place.latitude === 'number' && typeof place.longitude === 'number' && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).map((place) => [place.latitude!, place.longitude!]);
    return { countries: this.visitedCountries().size, cities: this.visitedCities().size, trips: trips.length, places: places.length, days, photos: trips.reduce((sum, trip) => sum + trip.mediaIds.length, 0), expenses: trips.flatMap((trip) => trip.expenses).reduce((sum, expense) => sum + expense.amount, 0), distance: this.distance(points) };
  });
  constructor() { void this.reload(); }
  async reload(): Promise<void> { this.trips.set(await this.repository.getTrips()); this.ready.set(true); }
  async save(trip: Trip): Promise<void> { await this.repository.saveTrip({ ...trip, updatedAt: new Date().toISOString() }); await this.reload(); }
  addRequestedChinaPlan(force = false): Promise<number> {
    if (this.chinaPlanImport) return this.chinaPlanImport;
    this.chinaPlanImport = (async () => {
      const { BEIJING_PLAN_KEY, mergeBeijingPlan } = await import('../data/beijing-trips');
      if (!force && localStorage.getItem(BEIJING_PLAN_KEY)) return 0;
      const merged = mergeBeijingPlan(await this.repository.getDocument());
      if (merged.added) await this.repository.replaceDocument(merged.document);
      await this.reload();
      localStorage.setItem(BEIJING_PLAN_KEY, 'added');
      return merged.added;
    })().finally(() => { this.chinaPlanImport = undefined; });
    return this.chinaPlanImport;
  }
  async delete(id: string): Promise<void> { await this.repository.deleteTrip(id); await this.reload(); }
  async document(): Promise<TravelDocument> { return this.repository.getDocument(); }
  async import(document: TravelDocument): Promise<void> { await this.repository.replaceDocument(document); await this.reload(); }
  async reset(): Promise<void> { await this.repository.reset(); await this.reload(); }
  private distance(points: number[][]): number {
    let total = 0; const radius = 6371;
    for (let i = 1; i < points.length; i++) { const [lat1, lon1] = points[i - 1]; const [lat2, lon2] = points[i]; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180; const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2; total += radius*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
    return Math.round(total);
  }
}
