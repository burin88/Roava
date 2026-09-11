import { Injectable } from '@angular/core';
import { TravelDocument, Trip } from '../models/travel.models';
import { TravelRepository } from './travel-repository';

const STORAGE_KEY = 'travel-atlas:poc';
const emptyDocument = (): TravelDocument => ({ schemaVersion: 1, profile: { displayName: 'My Atlas' }, trips: [] });

@Injectable()
export class LocalTravelRepository implements TravelRepository {
  async getDocument(): Promise<TravelDocument> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDocument();
    try { return this.validate(JSON.parse(raw)); } catch { return emptyDocument(); }
  }
  async replaceDocument(document: TravelDocument): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.validate(document)));
  }
  async getTrips(): Promise<Trip[]> { return (await this.getDocument()).trips; }
  async getTrip(id: string): Promise<Trip | null> { return (await this.getTrips()).find((trip) => trip.id === id) ?? null; }
  async saveTrip(trip: Trip): Promise<void> {
    const document = await this.getDocument(); const index = document.trips.findIndex((item) => item.id === trip.id);
    if (index >= 0) document.trips[index] = trip; else document.trips.push(trip); await this.replaceDocument(document);
  }
  async deleteTrip(id: string): Promise<void> {
    const document = await this.getDocument(); document.trips = document.trips.filter((trip) => trip.id !== id); await this.replaceDocument(document);
  }
  async reset(): Promise<void> { localStorage.removeItem(STORAGE_KEY); }
  private validate(value: unknown): TravelDocument {
    const input = value as Partial<TravelDocument> | null;
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.trips)) throw new Error('Unsupported or invalid Travel Atlas backup');
    return { schemaVersion: 1, profile: { displayName: input.profile?.displayName || 'My Atlas' }, trips: input.trips };
  }
}
