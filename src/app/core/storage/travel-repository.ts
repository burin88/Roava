import { TravelDocument, Trip } from '../models/travel.models';
export abstract class TravelRepository {
  abstract getDocument(): Promise<TravelDocument>;
  abstract replaceDocument(document: TravelDocument): Promise<void>;
  abstract getTrips(): Promise<Trip[]>;
  abstract getTrip(id: string): Promise<Trip | null>;
  abstract saveTrip(trip: Trip): Promise<void>;
  abstract deleteTrip(id: string): Promise<void>;
  abstract reset(): Promise<void>;
}
