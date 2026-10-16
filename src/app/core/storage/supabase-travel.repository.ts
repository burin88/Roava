import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import { TravelDocument, Trip } from '../models/travel.models';
import { TravelRepository } from './travel-repository';

@Injectable()
export class SupabaseTravelRepository extends TravelRepository {
  override readonly storageScope = 'supabase';
  private readonly supabase = inject(SupabaseService);
  private async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await this.supabase.client()).rpc(name, args);
    if (error) throw new Error(`บันทึก/โหลดข้อมูล Supabase ไม่สำเร็จ: ${error.message}`);
    return data as T;
  }
  override getDocument(): Promise<TravelDocument> { return this.rpc('roava_read_document'); }
  override async getTrips(): Promise<Trip[]> { return (await this.getDocument()).trips; }
  override async getTrip(id: string): Promise<Trip | null> { return (await this.getTrips()).find(t => t.id === id) ?? null; }
  override async saveTrip(trip: Trip): Promise<void> {
    await this.rpc('roava_write_document', { p_document: { schemaVersion: 1, trips: [trip] }, p_replace: false });
  }
  override async replaceDocument(document: TravelDocument): Promise<void> {
    await this.rpc('roava_write_document', { p_document: document, p_replace: true });
  }
  override async deleteTrip(id: string): Promise<void> { await this.rpc('roava_archive_trip', { p_id: id }); }
  override async reset(): Promise<void> {
    await this.replaceDocument({ schemaVersion: 1, profile: { displayName: 'My Atlas' }, trips: [] });
  }
}
