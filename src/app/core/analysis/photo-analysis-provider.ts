import { ExpenseType } from '../models/travel.models';
import { OcrScanResult } from '../ocr/ocr-provider';

export interface AnalyzedPlace { id: string; name: string; visitedAt: string; selected: boolean; evidence: string; }
export interface AnalyzedExpense { id: string; type: ExpenseType; amount: number; currency: string; note: string; selected: boolean; }
export interface PhotoTripAnalysis {
  confidence: number; countryCode: string; cityCode: string; name: string; startDate: string; endDate: string;
  description: string; notes: string; tags: string[]; places: AnalyzedPlace[]; expenses: AnalyzedExpense[];
  signals: string[];
}

export abstract class PhotoAnalysisProvider {
  abstract analyze(results: OcrScanResult[], capturedDates: string[]): PhotoTripAnalysis;
}
