import type { Trip } from './travel.models';

/** Companion city day trips share the parent's travel days, rather than adding them twice. */
export function countTravelDays(trips: readonly Pick<Trip, 'id' | 'journeyGroupId' | 'startDate' | 'endDate'>[]): number {
  const groups = new Map<string, Set<number>>();
  let invalid = 0;
  for (const trip of trips) {
    const start = Date.parse(trip.startDate); const end = Date.parse(trip.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) { invalid++; continue; }
    const key = trip.journeyGroupId ? `group:${trip.journeyGroupId}` : `trip:${trip.id}`;
    const days = groups.get(key) ?? new Set<number>();
    for (let date = start; date <= Math.max(start,end); date += 86400000) days.add(Math.floor(date / 86400000));
    groups.set(key, days);
  }
  return [...groups.values()].reduce((sum, days) => sum + days.size, invalid);
}
