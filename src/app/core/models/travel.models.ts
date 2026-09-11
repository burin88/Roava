export interface Place {
  id: string; name: string; latitude: number; longitude: number; visitedAt: string;
  time?: string; description?: string; note?: string; rating?: number; tags?: string[]; mediaIds?: string[];
}

export type ExpenseType = 'Transport' | 'Hotel' | 'Restaurant' | 'Ticket' | 'Shopping' | 'Other';
export interface Expense {
  id: string; type: ExpenseType; amount: number; currency: string; note?: string; spentAt?: string;
}

export interface Trip {
  id: string; name: string; countryCode: string; cityCode: string; startDate: string; endDate: string;
  cityName?: string; description: string; notes: string; transport?: string; hotel?: string; restaurant?: string;
  ticket?: string; route?: string; rating?: number; tags: string[]; places: Place[];
  expenses: Expense[]; mediaIds: string[]; createdAt: string; updatedAt: string;
}

export interface TravelDocument { schemaVersion: 1; profile: { displayName: string }; trips: Trip[]; }
export interface StoredMedia {
  id: string; tripId: string; placeId?: string; fileName: string; contentType: string;
  blob?: Blob; thumbnailBlob?: Blob; url?: string; thumbnailUrl?: string; storedFileName?: string;
  capturedAt?: string; latitude?: number; longitude?: number;
}
export interface TripSummary { title: string; lines: string[]; }
export interface ArchiveSummary { headline: string; narrative: string; insights: string[]; }
