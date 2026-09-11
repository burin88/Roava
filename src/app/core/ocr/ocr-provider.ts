export interface OcrScanResult {
  fileName: string;
  text: string;
  confidence: number;
}

export interface OcrProgress {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  status: string;
  progress: number;
}

export abstract class OcrProvider {
  abstract recognize(files: File[], onProgress?: (progress: OcrProgress) => void): Promise<OcrScanResult[]>;
}
