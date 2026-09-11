import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { LocalTravelRepository } from './core/storage/local-travel.repository';
import { TravelRepository } from './core/storage/travel-repository';
import { IndexedDbMediaStorage } from './core/storage/indexeddb-media.storage';
import { MediaStorage } from './core/storage/media-storage';
import { FileSystemMediaStorage } from './core/storage/file-system-media.storage';
import { LocalSummaryProvider } from './core/summary/local-summary.provider';
import { SummaryProvider } from './core/summary/summary-provider';
import { OcrProvider } from './core/ocr/ocr-provider';
import { TesseractOcrProvider } from './core/ocr/tesseract-ocr.provider';
import { PhotoAnalysisProvider } from './core/analysis/photo-analysis-provider';
import { LocalPhotoAnalysisProvider } from './core/analysis/local-photo-analysis.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    LocalTravelRepository, IndexedDbMediaStorage, FileSystemMediaStorage, LocalSummaryProvider, TesseractOcrProvider, LocalPhotoAnalysisProvider,
    { provide: TravelRepository, useExisting: LocalTravelRepository },
    { provide: MediaStorage, useExisting: FileSystemMediaStorage },
    { provide: SummaryProvider, useExisting: LocalSummaryProvider },
    { provide: OcrProvider, useExisting: TesseractOcrProvider },
    { provide: PhotoAnalysisProvider, useExisting: LocalPhotoAnalysisProvider },
  ],
};
