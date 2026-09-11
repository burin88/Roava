import { Injectable } from '@angular/core';
import { createWorker } from 'tesseract.js';
import { OcrProgress, OcrProvider, OcrScanResult } from './ocr-provider';

@Injectable()
export class TesseractOcrProvider implements OcrProvider {
  async recognize(files: File[], onProgress?: (progress: OcrProgress) => void): Promise<OcrScanResult[]> {
    let currentFile = 0;
    const worker = await createWorker(['eng', 'tha'], 1, {
      workerPath: '/assets/ocr/worker.min.js',
      corePath: '/assets/ocr/core',
      langPath: '/assets/ocr/lang',
      logger: (message) => onProgress?.({ currentFile: currentFile + 1, totalFiles: files.length, fileName: files[currentFile]?.name ?? '', status: this.label(message.status), progress: message.progress }),
    });
    try {
      const results: OcrScanResult[] = [];
      for (currentFile = 0; currentFile < files.length; currentFile++) {
        const result = await worker.recognize(files[currentFile], { rotateAuto: true });
        results.push({ fileName: files[currentFile].name, text: result.data.text.trim(), confidence: Math.round(result.data.confidence) });
      }
      return results;
    } finally {
      await worker.terminate();
    }
  }

  private label(status: string): string {
    const labels: Record<string, string> = { 'loading tesseract core': 'Loading OCR engine', 'initializing tesseract': 'Starting OCR engine', 'loading language traineddata': 'Loading Thai & English', 'initializing api': 'Preparing recognition', 'recognizing text': 'Reading text' };
    return labels[status] ?? status;
  }
}
