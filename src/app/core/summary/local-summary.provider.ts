import { Injectable } from '@angular/core';
import { countryByCode } from '../data/asia-catalog';
import { ArchiveSummary, Trip, TripSummary } from '../models/travel.models';
import { SummaryProvider } from './summary-provider';

@Injectable()
export class LocalSummaryProvider implements SummaryProvider {
  generateTripSummary(trip: Trip): TripSummary {
    const days = this.tripDays(trip);
    const total = trip.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const favorite = [...trip.places].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    return {
      title: trip.name,
      lines: [
        `เดินทางทั้งหมด ${days} วัน และบันทึก ${trip.places.length} สถานที่`,
        `ค่าใช้จ่ายรวม ${new Intl.NumberFormat('th-TH').format(total)} บาท`,
        favorite ? `ความทรงจำเด่น: ${favorite.name}${favorite.note ? ` — ${favorite.note}` : ''}` : 'เพิ่มสถานที่เพื่อสร้างเรื่องราวของทริปนี้',
      ],
    };
  }

  generateArchiveSummary(trips: readonly Trip[]): ArchiveSummary {
    if (!trips.length) {
      return {
        headline: 'Your world is ready for its first story.',
        narrative: 'Add a journey and this live summary will discover patterns across your destinations, dates, ratings and memories.',
        insights: ['0 countries explored', '0 travel days recorded', 'Updates automatically with every journey'],
      };
    }

    const countries = new Set(trips.map((trip) => trip.countryCode));
    const cities = new Set(trips.map((trip) => `${trip.countryCode}:${trip.cityCode}`));
    const continents = new Set(
      [...countries].map((code) => countryByCode(code)?.continentCode).filter((code): code is NonNullable<typeof code> => Boolean(code)),
    );
    const days = trips.reduce((sum, trip) => sum + this.tripDays(trip), 0);
    const places = trips.reduce((sum, trip) => sum + trip.places.length, 0);
    const photos = trips.reduce((sum, trip) => sum + trip.mediaIds.length, 0);
    const latest = [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const countryCounts = new Map<string, number>();
    for (const trip of trips) countryCounts.set(trip.countryCode, (countryCounts.get(trip.countryCode) ?? 0) + 1);
    const favoriteCode = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const favoriteCountry = favoriteCode ? countryByCode(favoriteCode)?.name ?? favoriteCode : '';
    const ratings = trips.flatMap((trip) => [trip.rating, ...trip.places.map((place) => place.rating)]).filter((rating): rating is number => rating !== undefined);
    const averageRating = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
    const tags = new Map<string, number>();
    for (const tag of trips.flatMap((trip) => trip.tags)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    const topTag = [...tags.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      headline: `${countries.size} ${countries.size === 1 ? 'country' : 'countries'} across ${continents.size} ${continents.size === 1 ? 'continent' : 'continents'}`,
      narrative: `Across ${trips.length} ${trips.length === 1 ? 'journey' : 'journeys'}, you have recorded ${days} travel days and ${cities.size} ${cities.size === 1 ? 'city' : 'cities'}. ${favoriteCountry} is your most revisited destination, while “${latest.name}” is the newest chapter in your atlas.`,
      insights: [
        `${places} places and ${photos} photos preserved`,
        averageRating === null ? 'Add ratings to reveal your travel score' : `${averageRating.toFixed(1)} / 5 average memory rating`,
        topTag ? `Your recurring travel theme is #${topTag}` : 'Add tags to discover your travel style',
      ],
    };
  }

  private tripDays(trip: Trip): number {
    const start = Date.parse(trip.startDate);
    const end = Date.parse(trip.endDate);
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 1;
  }
}
