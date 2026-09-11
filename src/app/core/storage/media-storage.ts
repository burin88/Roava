import { StoredMedia } from '../models/travel.models';
export abstract class MediaStorage {
  abstract save(file: File, tripId: string, placeId?: string): Promise<StoredMedia>;
  abstract get(id: string): Promise<Blob | null>;
  abstract getRecord(id: string): Promise<StoredMedia | null>;
  abstract delete(id: string): Promise<void>;
  abstract clear(): Promise<void>;
}
