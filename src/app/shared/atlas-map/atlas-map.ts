import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import * as maplibregl from 'maplibre-gl';
import { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import { Trip } from '../../core/models/travel.models';
import { ASIA_CONTINENT, ASIA_COUNTRIES, ContinentOption, CountryOption } from '../../core/data/asia-catalog';

interface AtlasFeature {
  properties: { code: string; name: string; label?: [number, number] };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

interface AtlasFeatureCollection {
  type: 'FeatureCollection';
  features: AtlasFeature[];
}

@Component({
  selector: 'atlas-map', standalone: true, template: '<div #fallback class="atlas-fallback-map" aria-hidden="true"></div><svg #overlay class="atlas-vector-overlay" aria-hidden="true"></svg><div #map class="map"></div>',
  styles: [':host{display:block;position:relative;width:100%;height:100%;min-height:520px;background:#071c1d;overflow:hidden}.atlas-fallback-map,.atlas-vector-overlay,.map{position:absolute;inset:0;width:100%;height:100%}.atlas-fallback-map{z-index:0}.atlas-vector-overlay{z-index:1;pointer-events:none;overflow:hidden}.map{z-index:2;min-height:520px}.city-marker{display:none}'],
})
export class AtlasMap implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('map', { static: true }) container!: ElementRef<HTMLDivElement>;
  @ViewChild('fallback', { static: true }) fallback!: ElementRef<HTMLDivElement>;
  @ViewChild('overlay', { static: true }) overlay!: ElementRef<SVGSVGElement>;
  @Input() trips: Trip[] = [];
  @Input() countries: readonly CountryOption[] = ASIA_COUNTRIES;
  @Input() continent: ContinentOption = ASIA_CONTINENT;
  @Input() continentKey = ASIA_CONTINENT.code;
  @Input() selectedCountry: string | null = null;
  @Output() countrySelected = new EventEmitter<string>();
  @Output() citySelected = new EventEmitter<{ countryCode: string; cityCode: string }>();
  private map?: MapLibreMap; private popup?: Popup;
  private cityMarkers: Marker[] = [];
  private countryLabelMarkers: Marker[] = [];
  private atlasData?: AtlasFeatureCollection;
  private overlayPaths = new globalThis.Map<string, SVGPathElement>();
  private overlayFrame?: number;
  private focusFrame?: number;
  private focusTimer?: number;
  private pendingFocusCountryCode: string | null = null;
  private geographyLoadId = 0;
  private loadedContinentKey = '';
  private eventsBound = false;
  private viewInitialized = false;
  private geographyReady = false;
  private readonly scheduleOverlaySync = (): void => {
    if (this.overlayFrame !== undefined) return;
    this.overlayFrame = requestAnimationFrame(() => { this.overlayFrame = undefined; this.syncVectorOverlay(); });
  };

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    void this.loadFallback();
    const width = this.container.nativeElement.clientWidth;
    const map = new maplibregl.Map({
      container: this.container.nativeElement, center: this.continent.center, zoom: this.initialZoom(width || 1024), minZoom: 1.1, maxZoom: 10,
      attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'rgba(7,28,29,0)' } }] },
    });
    this.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => void this.reloadContinent());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['continent'] || changes['continentKey']) && this.viewInitialized) void this.reloadContinent();
    if (changes['trips'] || changes['countries'] || changes['selectedCountry']) this.refresh();
  }
  ngOnDestroy(): void {
    this.clearCityMarkers(); this.clearCountryLabels();
    if (this.overlayFrame !== undefined) cancelAnimationFrame(this.overlayFrame);
    this.cancelPendingFocus();
    this.map?.off('move', this.scheduleOverlaySync); this.map?.off('resize', this.scheduleOverlaySync); this.map?.remove();
  }

  private refresh(): void {
    this.refreshFallback();
    this.refreshVectorOverlay();
    this.refreshCountryLabels();
    this.renderCities();
  }

  private async loadFallback(): Promise<void> {
    try {
      const response = await fetch(`/assets/maps/${this.continent.mapKey}/countries.svg`);
      if (!response.ok) throw new Error(`Map fallback unavailable for ${this.continent.name}`);
      this.setFallback(await response.text());
    } catch {
      this.fallback.nativeElement.style.background = '#071c1d';
    }
  }

  private async reloadContinent(): Promise<void> {
    if (this.loadedContinentKey === this.continent.code) return;
    this.loadedContinentKey = this.continent.code;
    this.geographyReady = false;
    this.atlasData = undefined;
    this.pendingFocusCountryCode = this.selectedCountry;
    this.cancelPendingFocus();
    this.clearCityMarkers();
    this.clearCountryLabels();
    this.popup?.remove();
    this.overlay.nativeElement.replaceChildren();
    this.overlayPaths.clear();
    this.fallback.nativeElement.innerHTML = '';
    await this.loadContinent();
  }

  private async loadContinent(): Promise<void> {
    const loadId = ++this.geographyLoadId;
    const continent = this.continent;
    const countries = this.countries;
    try {
      const base = `/assets/maps/${continent.mapKey}`;
      const [geoResponse, svgResponse] = await Promise.all([fetch(`${base}/countries.geojson`), fetch(`${base}/countries.svg`)]);
      if (!geoResponse.ok || !svgResponse.ok) throw new Error(`Map assets unavailable for ${continent.name}`);
      const [data, svg] = await Promise.all([geoResponse.json() as Promise<AtlasFeatureCollection>, svgResponse.text()]);
      if (loadId !== this.geographyLoadId) return;
      this.atlasData = data;
      this.geographyReady = true;
      this.setFallback(svg, countries);
      const map = this.map;
      if (!map) return;

      this.createVectorOverlay(data, countries);
      this.renderCountryLabels(data, countries);
      map.resize();
      if (!this.selectedCountry) map.jumpTo({ center: continent.center, zoom: this.initialZoom(this.container.nativeElement.clientWidth || 1024, continent) });
      this.syncVectorOverlay();
      this.refresh();
      if (this.pendingFocusCountryCode && this.pendingFocusCountryCode === this.selectedCountry) this.scheduleCountryFocus(this.pendingFocusCountryCode);

      if (!await this.waitForMapStyle(loadId)) return;
      const styledMap = this.map;
      if (!styledMap) return;
      const source = styledMap.getSource('atlas-countries') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data as never);
      else {
        styledMap.addSource('atlas-countries', { type: 'geojson', data: data as never });
        styledMap.addLayer({ id: 'countries-fill', type: 'fill', source: 'atlas-countries', paint: { 'fill-color': '#294440', 'fill-opacity': 0 } });
        styledMap.addLayer({ id: 'countries-line', type: 'line', source: 'atlas-countries', paint: { 'line-color': '#0b2928', 'line-opacity': 0 } });
      }
      this.bindMapEvents();
    } catch (cause) {
      console.error('Continent map failed to load', cause);
      this.fallback.nativeElement.style.background = '#071c1d';
    }
  }

  private async waitForMapStyle(loadId: number): Promise<boolean> {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (loadId !== this.geographyLoadId || !this.map) return false;
      if (this.map.isStyleLoaded()) return true;
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(done, 50);
        const map = this.map;
        function done(): void {
          window.clearTimeout(timeout);
          map?.off('idle', done);
          map?.off('styledata', done);
          resolve();
        }
        map?.once('idle', done);
        map?.once('styledata', done);
      });
    }
    return !!this.map?.isStyleLoaded() && loadId === this.geographyLoadId;
  }

  private setFallback(svg: string, countries = this.countries): void {
    this.fallback.nativeElement.innerHTML = svg;
    const element = this.fallback.nativeElement.querySelector('svg');
    if (element) { element.style.width = '100%'; element.style.height = '100%'; element.style.display = 'block'; }
    this.ensureFlagPatterns(element, countries);
    this.renderFallbackLabels(countries);
    this.refreshFallback();
    if (this.overlayPaths.size) this.hideStaticCountries();
  }

  private bindMapEvents(): void {
    if (!this.map || this.eventsBound) return;
    this.eventsBound = true;
    this.map.on('move', this.scheduleOverlaySync);
    this.map.on('resize', this.scheduleOverlaySync);
    this.map.on('mousemove', 'countries-fill', (event) => this.showCountryPopup(event));
    this.map.on('mouseleave', 'countries-fill', () => { this.map!.getCanvas().style.cursor = ''; this.popup?.remove(); });
    this.map.on('click', 'countries-fill', (event) => {
      const code = event.features?.[0]?.properties?.['code'] as string | undefined;
      if (code) this.countrySelected.emit(code);
    });
  }

  private refreshFallback(): void {
    const counts = new globalThis.Map<string, number>();
    this.trips.forEach((trip) => counts.set(trip.countryCode, (counts.get(trip.countryCode) ?? 0) + 1));
    this.fallback.nativeElement.querySelectorAll<SVGPathElement>('path[data-code]').forEach((path) => {
      const code = path.dataset['code'] ?? ''; const count = counts.get(code) ?? 0;
      const selected = code === this.selectedCountry; path.style.fill = count || selected ? `url(#flag-${code.toLowerCase()})` : '#294440';
      path.style.stroke = code === this.selectedCountry ? '#fff4bf' : count ? '#bce9da' : '#0b2928';
      path.style.strokeWidth = code === this.selectedCountry ? '2.5' : '1';
      path.style.opacity = this.selectedCountry && code !== this.selectedCountry ? '.28' : '1';
      if (count || selected) path.style.filter = 'drop-shadow(0 0 8px rgba(255,244,191,.48))'; else path.style.removeProperty('filter');
    });
    this.fallback.nativeElement.querySelectorAll<SVGTextElement>('text[data-label-code]').forEach((label) => {
      const code = label.dataset['labelCode'] ?? ''; const visited = counts.has(code);
      label.style.fill = '#f6fffc';
      label.style.stroke = visited ? 'rgba(1,16,15,.96)' : 'rgba(2,20,20,.92)';
      label.style.opacity = '1';
      label.style.fontWeight = visited ? '800' : '650';
    });
  }

  private renderFallbackLabels(countries = this.countries): void {
    const svg = this.fallback.nativeElement.querySelector('svg'); if (!svg) return;
    svg.querySelector('g[data-country-labels]')?.remove();
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset['countryLabels'] = 'true'; group.style.pointerEvents = 'none';
    if (this.countryLabelMarkers.length) group.style.display = 'none';
    for (const country of countries) {
      const path = svg.querySelector<SVGGraphicsElement>(`path[data-code="${country.code}"]`); if (!path) continue;
      const box = path.getBBox(); const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const fontSize = Math.max(7, Math.min(12, Math.max(box.width, 40) / Math.max(country.name.length * .58, 4)));
      label.dataset['labelCode'] = country.code; label.textContent = country.name;
      label.setAttribute('x', String(box.x + box.width / 2)); label.setAttribute('y', String(box.y + box.height / 2));
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('dominant-baseline', 'central');
      label.style.fontFamily = 'Inter, Segoe UI, sans-serif'; label.style.fontSize = `${fontSize}px`;
      label.style.letterSpacing = '.02em'; label.style.paintOrder = 'stroke fill'; label.style.strokeWidth = '2.4px';
      label.style.strokeLinejoin = 'round'; label.style.vectorEffect = 'non-scaling-stroke';
      group.appendChild(label);
    }
    svg.appendChild(group);
  }

  private ensureFlagPatterns(svg: SVGSVGElement | null, countries = this.countries): void {
    if (!svg) return;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.prepend(defs); }
    for (const country of countries) {
      const id = `flag-${country.code.toLowerCase()}`; if (defs.querySelector(`#${id}`)) continue;
      defs.appendChild(this.createFlagPattern(country.code));
    }
  }

  private createFlagPattern(code: string): SVGPatternElement {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.id = `flag-${code.toLowerCase()}`; pattern.setAttribute('width', '1'); pattern.setAttribute('height', '1');
    pattern.setAttribute('patternUnits', 'objectBoundingBox'); pattern.setAttribute('patternContentUnits', 'objectBoundingBox');
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', `/assets/flags/4x3/${code.toLowerCase()}.svg`); image.setAttribute('width', '1'); image.setAttribute('height', '1');
    image.setAttribute('preserveAspectRatio', 'none'); pattern.appendChild(image); return pattern;
  }

  private createVectorOverlay(data: AtlasFeatureCollection, countries = this.countries): void {
    const svg = this.overlay.nativeElement; svg.replaceChildren(); this.overlayPaths.clear();
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    for (const country of countries) defs.appendChild(this.createFlagPattern(country.code));
    svg.appendChild(defs);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.setAttribute('fill-rule', 'evenodd');
    for (const feature of data.features) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.dataset['code'] = feature.properties.code;
      path.style.vectorEffect = 'non-scaling-stroke'; path.style.transition = 'fill .25s, opacity .25s, filter .25s';
      group.appendChild(path); this.overlayPaths.set(feature.properties.code, path);
    }
    svg.appendChild(group); this.hideStaticCountries(); this.syncVectorOverlay(); this.refreshVectorOverlay();
  }

  private syncVectorOverlay(): void {
    if (!this.map || !this.atlasData) return;
    const width = this.container.nativeElement.clientWidth; const height = this.container.nativeElement.clientHeight;
    this.overlay.nativeElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const feature of this.atlasData.features) {
      const path = this.overlayPaths.get(feature.properties.code); if (!path) continue;
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as number[][][]]
        : feature.geometry.coordinates as number[][][][];
      const commands: string[] = []; let minX = Number.POSITIVE_INFINITY; let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY;
      for (const polygon of polygons) for (const ring of polygon) {
        ring.forEach((coordinate, index) => {
          const longitude = this.nearestLongitude(coordinate[0], this.map!.getCenter().lng);
          const point = this.map!.project([longitude, this.clampLatitude(coordinate[1])]);
          minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
          commands.push(`${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
        });
        commands.push('Z');
      }
      path.setAttribute('d', commands.join(''));
      const pattern = this.overlay.nativeElement.querySelector<SVGPatternElement>(`#flag-${feature.properties.code.toLowerCase()}`);
      const image = pattern?.querySelector<SVGImageElement>('image');
      if (pattern && image && Number.isFinite(minX) && maxX > minX && maxY > minY) {
        const patternWidth = maxX - minX; const patternHeight = maxY - minY;
        pattern.setAttribute('patternUnits', 'userSpaceOnUse'); pattern.setAttribute('patternContentUnits', 'userSpaceOnUse');
        pattern.setAttribute('x', String(minX)); pattern.setAttribute('y', String(minY));
        pattern.setAttribute('width', String(patternWidth)); pattern.setAttribute('height', String(patternHeight));
        image.setAttribute('x', String(minX)); image.setAttribute('y', String(minY));
        image.setAttribute('width', String(patternWidth)); image.setAttribute('height', String(patternHeight));
      }
    }
  }

  private refreshVectorOverlay(): void {
    const visited = new Set(this.trips.map((trip) => trip.countryCode));
    for (const [code, path] of this.overlayPaths) {
      const hasVisited = visited.has(code); const selected = code === this.selectedCountry;
      path.style.fill = hasVisited || selected ? `url(#flag-${code.toLowerCase()})` : '#294440';
      path.style.stroke = code === this.selectedCountry ? '#fff4bf' : hasVisited ? '#bce9da' : '#0b2928';
      path.style.strokeWidth = code === this.selectedCountry ? '2.5' : '1';
      path.style.opacity = this.selectedCountry && code !== this.selectedCountry ? '.28' : '1';
      path.style.filter = hasVisited || selected ? 'drop-shadow(0 0 8px rgba(255,244,191,.48))' : '';
    }
  }

  private hideStaticCountries(): void {
    this.fallback.nativeElement.querySelectorAll<SVGPathElement>('path[data-code]').forEach((path) => path.style.visibility = 'hidden');
    const labels = this.fallback.nativeElement.querySelector<SVGGElement>('g[data-country-labels]'); if (labels) labels.style.display = 'none';
  }

  private renderCountryLabels(data: AtlasFeatureCollection, countries = this.countries): void {
    this.clearCountryLabels(); if (!this.map) return;
    for (const feature of data.features) {
      const country = countries.find((item) => item.code === feature.properties.code); if (!country) continue;
      const element = document.createElement('span'); element.className = 'atlas-country-label';
      element.dataset['countryCode'] = country.code; element.textContent = country.name; element.title = country.name;
      this.countryLabelMarkers.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(this.labelPoint(feature)).addTo(this.map));
    }
    const fallbackLabels = this.fallback.nativeElement.querySelector<SVGGElement>('g[data-country-labels]');
    if (fallbackLabels) fallbackLabels.style.display = 'none';
    this.refreshCountryLabels();
  }

  private refreshCountryLabels(): void {
    const visited = new Set(this.trips.map((trip) => trip.countryCode));
    for (const marker of this.countryLabelMarkers) {
      const element = marker.getElement(); const code = element.dataset['countryCode'] ?? '';
      element.classList.toggle('visited', visited.has(code));
      element.classList.toggle('selected', code === this.selectedCountry);
    }
  }

  private labelPoint(feature: AtlasFeature): [number, number] {
    if (feature.properties.label) return [feature.properties.label[0], this.clampLatitude(feature.properties.label[1])];
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : feature.geometry.coordinates as number[][][][];
    const rings = polygons.map((polygon) => polygon[0]).filter((ring) => ring?.length);
    const ring = rings.reduce((largest, candidate) => Math.abs(this.ringArea(candidate)) > Math.abs(this.ringArea(largest)) ? candidate : largest, rings[0]);
    if (!ring?.length) return [0, 0];
    const area = this.ringArea(ring); if (Math.abs(area) < .000001) {
      return [ring.reduce((sum, point) => sum + point[0], 0) / ring.length, this.clampLatitude(ring.reduce((sum, point) => sum + point[1], 0) / ring.length)];
    }
    let x = 0; let y = 0;
    for (let index = 0; index < ring.length - 1; index++) {
      const cross = ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
      x += (ring[index][0] + ring[index + 1][0]) * cross; y += (ring[index][1] + ring[index + 1][1]) * cross;
    }
    return [x / (6 * area), this.clampLatitude(y / (6 * area))];
  }

  private ringArea(ring: number[][]): number {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index++) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    return area / 2;
  }

  private initialZoom(width: number, continent = this.continent): number {
    const adjustment = width < 480 ? -.8 : width < 600 ? -.45 : 0;
    return Math.max(1.1, continent.zoom + adjustment);
  }

  private renderCities(): void {
    this.clearCityMarkers(); if (!this.map) return;
    if (!this.selectedCountry) { this.pendingFocusCountryCode = null; this.cancelPendingFocus(); this.focusContinent(); return; }
    const country = this.countries.find((item) => item.code === this.selectedCountry); if (!country) return;
    if (!this.atlasData || !this.geographyReady) { this.pendingFocusCountryCode = country.code; return; }
    const visited = new Set(this.trips.filter((trip) => trip.countryCode === country.code).map((trip) => trip.cityCode));
    country.cities.forEach((city) => {
      const element = document.createElement('button'); element.className = `atlas-city-marker ${visited.has(city.code) ? 'visited' : ''}`;
      element.innerHTML = `<span></span><b>${city.name}</b>`; element.title = `Open ${city.name} memories`;
      element.addEventListener('click', (event) => { event.stopPropagation(); this.citySelected.emit({ countryCode: country.code, cityCode: city.code }); });
      this.cityMarkers.push(new maplibregl.Marker({ element }).setLngLat(city.coordinates).addTo(this.map!));
    });
    this.scheduleCountryFocus(country.code);
  }

  private scheduleCountryFocus(code: string): void {
    this.pendingFocusCountryCode = code;
    this.cancelPendingFocus();
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = undefined;
      this.tryPendingCountryFocus(code, 0);
    });
    this.map?.once('idle', () => this.tryPendingCountryFocus(code, 0));
  }

  private cancelPendingFocus(): void {
    if (this.focusFrame !== undefined) {
      cancelAnimationFrame(this.focusFrame);
      this.focusFrame = undefined;
    }
    if (this.focusTimer !== undefined) {
      window.clearTimeout(this.focusTimer);
      this.focusTimer = undefined;
    }
  }

  private tryPendingCountryFocus(code: string, attempt: number): void {
    if (this.selectedCountry !== code || this.pendingFocusCountryCode !== code) return;
    if (!this.map || !this.atlasData || !this.geographyReady) {
      this.queueFocusRetry(code, attempt);
      return;
    }
    const focused = this.focusCountry(code);
    if (!focused) this.queueFocusRetry(code, attempt);
  }

  private queueFocusRetry(code: string, attempt: number): void {
    if (attempt >= 8 || this.selectedCountry !== code) return;
    if (this.focusTimer !== undefined) window.clearTimeout(this.focusTimer);
    this.focusTimer = window.setTimeout(() => {
      this.focusTimer = undefined;
      this.tryPendingCountryFocus(code, attempt + 1);
    }, 90);
  }

  private focusCountry(code: string): boolean {
    if (!this.map || !this.atlasData || !this.geographyReady) return false;
    const feature = this.atlasData.features.find((item) => item.properties.code === code); if (!feature) return false;
    this.pendingFocusCountryCode = null;
    const bounds = new maplibregl.LngLatBounds();
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : feature.geometry.coordinates as number[][][][];
    const anchor = feature.properties.label?.[0] ?? this.continent.center[0];
    for (const polygon of polygons) for (const ring of polygon) for (const coordinate of ring) {
      bounds.extend([this.nearestLongitude(coordinate[0], anchor), this.clampLatitude(coordinate[1])]);
    }
    const mobile = this.container.nativeElement.clientWidth < 700;
    const span = Math.max(bounds.getEast() - bounds.getWest(), bounds.getNorth() - bounds.getSouth());
    const focusMaxZoom = span < .75 ? 8.4 : span < 2 ? 7.2 : span < 5 ? 6.4 : 5.6;
    this.map.stop();
    this.map.fitBounds(bounds, {
      padding: mobile ? { top: 55, right: 42, bottom: 300, left: 42 } : { top: 72, right: 72, bottom: 72, left: 350 },
      maxZoom: focusMaxZoom, duration: 900, essential: true,
    });
    return true;
  }

  private focusContinent(): void {
    if (!this.map) return;
    this.map.easeTo({ center: this.continent.center, zoom: this.initialZoom(this.container.nativeElement.clientWidth || 1024), duration: 700, essential: true });
  }

  private clampLatitude(latitude: number): number { return Math.max(-85, Math.min(85, latitude)); }
  private nearestLongitude(longitude: number, anchor: number): number {
    let value = longitude;
    while (value - anchor > 180) value -= 360;
    while (value - anchor < -180) value += 360;
    return value;
  }

  private showCountryPopup(event: maplibregl.MapLayerMouseEvent): void {
    this.map!.getCanvas().style.cursor = 'pointer'; const properties = event.features?.[0]?.properties; if (!properties) return;
    const code = properties['code']; const countryTrips = this.trips.filter((trip) => trip.countryCode === code);
    const days = countryTrips.reduce((sum, trip) => sum + Math.max(1, Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1), 0);
    const expenses = countryTrips.flatMap((trip) => trip.expenses).reduce((sum, expense) => sum + expense.amount, 0);
    const html = `<div class="map-popup"><small>${countryTrips.length ? 'EXPLORED' : 'NOT VISITED'}</small><strong>${properties['name']}</strong><div><span>Trips <b>${countryTrips.length}</b></span><span>Days <b>${days}</b></span></div><div><span>Places <b>${countryTrips.flatMap((trip) => trip.places).length}</b></span><span>THB <b>${expenses.toLocaleString()}</b></span></div><em>Click to explore →</em></div>`;
    this.popup?.remove(); this.popup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'atlas-popup' }).setLngLat(event.lngLat).setHTML(html).addTo(this.map!);
  }
  private clearCityMarkers(): void { this.cityMarkers.forEach((marker) => marker.remove()); this.cityMarkers = []; }
  private clearCountryLabels(): void { this.countryLabelMarkers.forEach((marker) => marker.remove()); this.countryLabelMarkers = []; }
}
