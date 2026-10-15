import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TravelStore } from '../../core/state/travel-store';
import { countryByCode } from '../../core/data/asia-catalog';
import { CHINA_PROVINCES, ProvinceMap, chinaProvinceByCode, primaryProvinceForTrip, provinceForCity, provincesForTrip } from '../../core/data/china-provinces';
import { Trip } from '../../core/models/travel.models';
import { TripEditor } from '../trips/trip-editor/trip-editor';

@Component({
  selector: 'china-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, TripEditor],
  templateUrl: './china-dashboard.html',
  styleUrl: './china-dashboard.css',
})
export class ChinaDashboard {
  readonly store = inject(TravelStore);
  readonly china = countryByCode('CN')!;
  readonly provinces = CHINA_PROVINCES;
  readonly chinaCountries = [this.china];
  readonly map = signal<ProvinceMap | null>(null);
  readonly mapError = signal(false);
  readonly selectedCode = signal<string | null>(null);
  readonly query = signal('');
  readonly visitedOnly = signal(false);
  readonly editorOpen = signal(false);
  readonly editingTrip = signal<Trip | null>(null);
  readonly zoom = signal(1);
  readonly center = signal<[number, number]>([500, 335]);
  readonly saving = signal(false);
  readonly saveError = signal('');
  private readonly abort = new AbortController();
  private drag?: { x: number; y: number; cx: number; cy: number; width: number; height: number; pointerId: number };
  private dragged = false;
  readonly trips = computed(() => this.store.trips().filter(trip => trip.countryCode === 'CN'));
  readonly tripRegions = computed(() => new Map(this.trips().map(trip => [trip.id, provincesForTrip(trip, this.map()?.provinces ?? [])])));
  readonly visited = computed(() => new Set([...this.tripRegions().values()].flatMap(codes => [...codes])));
  readonly selected = computed(() => chinaProvinceByCode(this.selectedCode() ?? undefined));
  readonly selectedTrips = computed(() => this.trips().filter(trip => this.tripRegions().get(trip.id)?.has(this.selectedCode() ?? '')).sort((a,b) => b.startDate.localeCompare(a.startDate)));
  readonly unmatched = computed(() => this.trips().filter(trip => !this.tripRegions().get(trip.id)?.size));
  readonly cityCount = computed(() => new Set(this.trips().map(trip => trip.cityCode)).size);
  readonly placeCount = computed(() => this.trips().reduce((total, trip) => total + trip.places.length, 0));
  readonly progress = computed(() => Math.round(this.visited().size / this.provinces.length * 100));
  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.provinces.filter(province => (!this.visitedOnly() || this.visited().has(province.code)) &&
      `${province.name} ${province.thaiName} ${province.localName} ${province.capital}`.toLocaleLowerCase().includes(query));
  });
  readonly shapes = computed(() => (this.map()?.provinces ?? []).map(shape => ({ ...shape, province: chinaProvinceByCode(shape.code)! })));
  readonly selectedCities = computed(() => {
    const code = this.selectedCode();
    const cities = this.china.cities.filter(city => provinceForCity(city.code) === code);
    for (const trip of this.selectedTrips()) {
      if (primaryProvinceForTrip(trip) === code && !cities.some(city => city.code === trip.cityCode)) {
        cities.push({ code: trip.cityCode, name: trip.cityName || trip.cityCode.replaceAll('_', ' '), coordinates: [0, 0] });
      }
    }
    return cities;
  });
  readonly viewBox = computed(() => {
    const [cx, cy] = this.center(); const width = 1000 / this.zoom(); const height = 670 / this.zoom();
    return `${cx - width / 2} ${cy - height / 2} ${width} ${height}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.abort.abort());
    void this.loadMap();
    void this.store.addRequestedChinaPlan().catch(() => this.saveError.set('เพิ่มแผนปักกิ่ง–เทียนจินไม่สำเร็จ กรุณาลองอีกครั้งจากหน้า /beijing'));
  }
  async loadMap(): Promise<void> {
    this.mapError.set(false);
    try {
      const response = await fetch('/assets/maps/china/provinces.json', { signal: this.abort.signal });
      if (!response.ok) throw new Error('Province map unavailable');
      this.map.set(await response.json() as ProvinceMap);
    } catch {
      if (!this.abort.signal.aborted) this.mapError.set(true);
    }
  }
  selectProvince(code: string): void {
    this.selectedCode.set(code);
  }
  selectMapProvince(code: string): void { if (!this.dragged) this.selectProvince(code); }
  regionTripCount(code: string): number { return this.trips().filter(trip => this.tripRegions().get(trip.id)?.has(code)).length; }
  zoomBy(factor: number): void { this.zoom.set(Math.max(1, Math.min(8, this.zoom() * factor))); if (this.zoom() === 1) this.center.set([500,335]); }
  resetMap(): void { this.zoom.set(1); this.center.set([500,335]); }
  focusProvince(): void {
    const shape = this.map()?.provinces.find(province => province.code === this.selectedCode());
    if (!shape) return;
    const [[x1, y1],[x2,y2]] = shape.bounds;
    this.center.set([(x1+x2)/2,(y1+y2)/2]);
    this.zoom.set(Math.max(1, Math.min(8, Math.min(800/Math.max(1,x2-x1),500/Math.max(1,y2-y1)))));
  }
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    this.dragged = false;
    this.drag = { x: event.clientX, y: event.clientY, cx: this.center()[0], cy: this.center()[1], width: rect.width, height: rect.height, pointerId: event.pointerId };
  }
  pointerMove(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const dx = event.clientX-this.drag.x; const dy = event.clientY-this.drag.y;
    if (Math.abs(dx)+Math.abs(dy) < 5 && !this.dragged) return;
    this.dragged = true;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
    const unitsPerPixel = Math.max(1000/this.drag.width,670/this.drag.height)/this.zoom();
    this.center.set([Math.max(0, Math.min(1000, this.drag.cx-dx*unitsPerPixel)), Math.max(0, Math.min(670, this.drag.cy-dy*unitsPerPixel))]);
  }
  pointerUp(): void { this.drag = undefined; }
  openEditor(trip: Trip | null = null): void { this.editingTrip.set(trip); this.saveError.set(''); this.editorOpen.set(true); }
  async saveTrip(trip: Trip): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true); this.saveError.set('');
    try {
      await this.store.save(trip);
      this.editorOpen.set(false);
      this.selectedCode.set(primaryProvinceForTrip(trip) ?? this.selectedCode());
    } catch { this.saveError.set('บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง หรือตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์'); }
    finally { this.saving.set(false); }
  }
}
