import { computed, inject, Injectable, signal } from '@angular/core';
import { TravelRepository } from '../storage/travel-repository';
import { TravelDocument, Trip } from '../models/travel.models';

@Injectable({ providedIn: 'root' })
export class TravelStore {
  private readonly repository = inject(TravelRepository);
  readonly trips = signal<Trip[]>([]);
  readonly ready = signal(false);
  readonly visitedCountries = computed(() => new Set(this.trips().map((trip) => trip.countryCode)));
  readonly visitedCities = computed(() => new Set(this.trips().map((trip) => `${trip.countryCode}:${trip.cityCode}`)));
  readonly stats = computed(() => {
    const trips = this.trips();
    const days = trips.reduce((sum, trip) => sum + Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1), 0);
    const places = trips.flatMap((trip) => trip.places);
    return { countries: this.visitedCountries().size, cities: this.visitedCities().size, trips: trips.length, places: places.length, days, photos: trips.reduce((sum, trip) => sum + trip.mediaIds.length, 0), expenses: trips.flatMap((trip) => trip.expenses).reduce((sum, expense) => sum + expense.amount, 0), distance: this.distance(places.map((place) => [place.latitude, place.longitude])) };
  });
  constructor() { void this.reload(); }
  async reload(): Promise<void> { this.trips.set(await this.repository.getTrips()); this.ready.set(true); }
  async save(trip: Trip): Promise<void> { await this.repository.saveTrip({ ...trip, updatedAt: new Date().toISOString() }); await this.reload(); }
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
