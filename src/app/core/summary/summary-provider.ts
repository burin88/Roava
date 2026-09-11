import { ArchiveSummary, Trip, TripSummary } from '../models/travel.models';

export abstract class SummaryProvider {
  abstract generateTripSummary(trip: Trip): TripSummary;
  abstract generateArchiveSummary(trips: readonly Trip[]): ArchiveSummary;
}
