import { Injectable } from '@angular/core';
import { COUNTRY_CATALOG } from '../data/asia-catalog';
import { ExpenseType } from '../models/travel.models';
import { OcrScanResult } from '../ocr/ocr-provider';
import { AnalyzedExpense, AnalyzedPlace, PhotoAnalysisProvider, PhotoTripAnalysis } from './photo-analysis-provider';

const aliases: Record<string, string[]> = {
  CN: ['china','จีน','beijing','ปักกิ่ง','shanghai','เซี่ยงไฮ้'], JP: ['japan','ญี่ปุ่น','tokyo','โตเกียว','osaka','โอซาก้า','kyoto','เกียวโต'],
  TH: ['thailand','ไทย','bangkok','กรุงเทพ','เชียงใหม่','ภูเก็ต'], KR: ['south korea','korea','เกาหลี','seoul','โซล'],
  SG: ['singapore','สิงคโปร์'], VN: ['vietnam','เวียดนาม','hanoi','ฮานอย'], MY: ['malaysia','มาเลเซีย','kuala lumpur'],
};

@Injectable()
export class LocalPhotoAnalysisProvider implements PhotoAnalysisProvider {
  analyze(results: OcrScanResult[], capturedDates: string[]): PhotoTripAnalysis {
    const combined = results.map((result) => result.text).join('\n'); const lower = combined.toLowerCase();
    const country = COUNTRY_CATALOG.flatMap((item) => [item.name.toLowerCase(), ...(aliases[item.code] ?? [])].map((term) => ({ item, term })))
      .filter(({ term }) => this.includesTerm(lower, term)).sort((a, b) => b.term.length - a.term.length)[0]?.item;
    let detectedCountry = country;
    let city = detectedCountry?.cities.find((item) => this.includesTerm(lower, item.name.toLowerCase()) || this.cityAliases(item.code).some((alias) => this.includesTerm(lower, alias)));
    if (!detectedCountry) {
      const cityMatch = COUNTRY_CATALOG.flatMap((item) => item.cities.map((candidate) => ({ item, candidate })))
        .filter(({ candidate }) => this.includesTerm(lower, candidate.name.toLowerCase()))
        .sort((a, b) => b.candidate.name.length - a.candidate.name.length)[0];
      if (cityMatch) { detectedCountry = cityMatch.item; city = cityMatch.candidate; }
    }
    const countryDetected = !!detectedCountry; const cityDetected = !!city;
    detectedCountry ??= COUNTRY_CATALOG.find((item) => item.code === 'TH')!; city ??= detectedCountry.cities[0];
    const dates = [...new Set([...this.extractDates(combined), ...capturedDates.filter(Boolean)])].sort();
    const startDate = dates[0] ?? new Date().toISOString().slice(0, 10); const endDate = dates.at(-1) ?? startDate;
    const expenses = this.extractExpenses(combined); const places = this.extractPlaces(combined, startDate, city.name);
    const tags = [...new Set([expenses.length ? 'expense-scan' : '', /hotel|โรงแรม/i.test(combined) ? 'hotel' : '', /flight|airport|boarding|สนามบิน|เที่ยวบิน/i.test(combined) ? 'flight' : '', 'ocr-import'].filter(Boolean))];
    const confidenceParts = [countryDetected ? 24 : 0, cityDetected ? 22 : 0, dates.length ? 18 : 0, expenses.length ? 18 : 0, places.length ? 10 : 0, Math.min(8, Math.round(results.reduce((sum, result) => sum + result.confidence, 0) / Math.max(1, results.length) / 12.5))];
    const signals = [`อ่านข้อความจาก ${results.length} รูป`, `OCR เฉลี่ย ${Math.round(results.reduce((sum, result) => sum + result.confidence, 0) / Math.max(1, results.length))}%`, dates.length ? `พบวันที่ ${dates.length} ค่า` : 'ไม่พบวันที่ที่ชัดเจน', expenses.length ? `พบค่าใช้จ่าย ${expenses.length} รายการ` : 'ไม่พบยอดเงินที่ชัดเจน'];
    return { confidence: Math.min(98, confidenceParts.reduce((sum, value) => sum + value, 0)), countryCode: detectedCountry.code, cityCode: city.code, name: `${city.name} ${new Date(startDate).getFullYear()}`, startDate, endDate, description: `สร้างจาก OCR ของรูป ${results.length} รูป กรุณาตรวจสอบข้อมูลก่อนบันทึก`, notes: results.map((result) => `[${result.fileName}]\n${result.text || '(ไม่พบข้อความ)'}`).join('\n\n'), tags, places, expenses, signals };
  }

  private extractDates(text: string): string[] {
    const dates: string[] = []; let match: RegExpExecArray | null;
    const iso = /\b(20\d{2}|25\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
    while ((match = iso.exec(text))) dates.push(this.toIso(+match[1], +match[2], +match[3]));
    const dayFirst = /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|25\d{2})\b/g;
    while ((match = dayFirst.exec(text))) dates.push(this.toIso(+match[3], +match[2], +match[1]));
    const months: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const named = /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi;
    while ((match = named.exec(text))) dates.push(this.toIso(+match[3], months[match[2].slice(0,3).toLowerCase()], +match[1]));
    return dates.filter((date) => date !== '');
  }
  private toIso(year: number, month: number, day: number): string { if (year > 2400) year -= 543; const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year.toString().padStart(4,'0')}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}` : ''; }
  private extractExpenses(text: string): AnalyzedExpense[] {
    const output: AnalyzedExpense[] = [];
    for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      const match = line.match(/(?:THB|฿)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:THB|บาท|฿)/i); if (!match) continue;
      const amount = Number((match[1] ?? match[2]).replace(/,/g, '')); if (!amount || amount > 10000000) continue;
      output.push({ id: crypto.randomUUID(), type: this.expenseType(line), amount, currency: 'THB', note: line.slice(0, 100), selected: true });
      if (output.length >= 12) break;
    }
    return output;
  }
  private expenseType(line: string): ExpenseType { if (/hotel|room|โรงแรม|ที่พัก/i.test(line)) return 'Hotel'; if (/restaurant|food|coffee|cafe|อาหาร|ร้าน|กาแฟ/i.test(line)) return 'Restaurant'; if (/taxi|flight|train|bus|transport|grab|didi|รถ|ตั๋วเครื่องบิน/i.test(line)) return 'Transport'; if (/ticket|admission|entry|บัตร|ค่าเข้า/i.test(line)) return 'Ticket'; if (/shop|store|mall|ซื้อ|สินค้า/i.test(line)) return 'Shopping'; return 'Other'; }
  private extractPlaces(text: string, date: string, cityName: string): AnalyzedPlace[] {
    const keywords = /temple|park|museum|airport|palace|beach|market|hotel|restaurant|station|tower|วัด|สวน|พิพิธภัณฑ์|สนามบิน|พระราชวัง|หาด|ตลาด|โรงแรม|ร้าน|สถานี/i; const seen = new Set<string>(); const output: AnalyzedPlace[] = [];
    for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/[^\p{L}\p{N}\s&'().-]/gu, ' ').replace(/\s+/g, ' ').trim(); if (line.length < 4 || line.length > 80 || !keywords.test(line) || /(?:THB|฿|บาท)\s*[\d,]+|[\d,]+\s*(?:THB|฿|บาท)/i.test(raw) || seen.has(line.toLowerCase())) continue; seen.add(line.toLowerCase()); output.push({ id: crypto.randomUUID(), name: line, visitedAt: date, selected: true, evidence: raw.trim() }); if (output.length >= 8) break; }
    if (!output.length && text.trim()) output.push({ id: crypto.randomUUID(), name: cityName, visitedAt: date, selected: false, evidence: 'Suggested from detected city' });
    return output;
  }
  private includesTerm(text: string, term: string): boolean {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
  }
  private cityAliases(code: string): string[] { const values: Record<string,string[]> = { BEIJING:['ปักกิ่ง'],SHANGHAI:['เซี่ยงไฮ้'],TOKYO:['โตเกียว'],OSAKA:['โอซาก้า'],KYOTO:['เกียวโต'],BANGKOK:['กรุงเทพ'],CHIANG_MAI:['เชียงใหม่'],PHUKET:['ภูเก็ต'],SEOUL:['โซล'] }; return values[code] ?? []; }
}
