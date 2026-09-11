import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, signal, SimpleChanges, ViewChild } from '@angular/core';
import { CONTINENTS } from '../../core/data/asia-catalog';

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];

interface GlobeFeature {
  properties: { code: string; name: string };
  polygons: Polygon[];
}

interface GeoJsonFeature {
  properties: { code: string; name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
}

interface GeoJsonCollection { features: GeoJsonFeature[]; }
interface ProjectedPoint { x: number; y: number; visible: boolean; }
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

@Component({
  selector: 'world-globe',
  standalone: true,
  templateUrl: './world-globe.html',
  styleUrl: './world-globe.css',
})
export class WorldGlobe implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  @Input() visitedCountries: readonly string[] = [];

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly rotating = signal(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  private features: GlobeFeature[] = [];
  private readonly flagImages = new Map<string, HTMLImageElement>();
  private readonly visited = new Set<string>();
  private resizeObserver?: ResizeObserver;
  private frame?: number;
  private lastFrame = performance.now();
  private longitude = 94;
  private latitude = 18;
  private zoom = 1;
  dragging = false;
  private dragX = 0;
  private dragY = 0;

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.canvas.nativeElement);
    this.syncVisitedCountries();
    void this.loadWorld();
    this.frame = requestAnimationFrame((time) => this.animate(time));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visitedCountries']) {
      this.syncVisitedCountries();
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }

  toggleRotation(): void {
    this.rotating.update((rotating) => !rotating);
    this.lastFrame = performance.now();
  }

  resetView(): void {
    this.longitude = 94;
    this.latitude = 18;
    this.zoom = 1;
    this.render();
  }

  pointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.canvas.nativeElement.setPointerCapture(event.pointerId);
  }

  pointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const width = Math.max(this.canvas.nativeElement.clientWidth, 1);
    this.longitude = this.wrapLongitude(this.longitude - (event.clientX - this.dragX) * 180 / width);
    this.latitude = Math.max(-75, Math.min(75, this.latitude + (event.clientY - this.dragY) * 150 / width));
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.render();
  }

  pointerUp(event: PointerEvent): void {
    this.dragging = false;
    if (this.canvas.nativeElement.hasPointerCapture(event.pointerId)) this.canvas.nativeElement.releasePointerCapture(event.pointerId);
  }

  wheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoom = Math.max(0.78, Math.min(1.32, this.zoom - event.deltaY * 0.0007));
    this.render();
  }

  private async loadWorld(): Promise<void> {
    try {
      const collections = await Promise.all(CONTINENTS.map(async (continent) => {
        const response = await fetch(`/assets/maps/${continent.mapKey}/countries.geojson`);
        if (!response.ok) throw new Error(`Unable to load ${continent.name}`);
        return response.json() as Promise<GeoJsonCollection>;
      }));
      const unique = new Map<string, GlobeFeature>();
      for (const feature of collections.flatMap((collection) => collection.features)) {
        const code = feature.properties.code?.toUpperCase();
        if (!code || unique.has(code)) continue;
        const polygons = feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates as Position[][]]
          : feature.geometry.coordinates as Position[][][];
        unique.set(code, {
          properties: { code, name: feature.properties.name },
          polygons: polygons.map((polygon) => polygon.map((ring) => this.simplifyRing(ring))),
        });
      }
      this.features = [...unique.values()];
      this.loading.set(false);
      this.error.set(false);
      this.render();
    } catch {
      this.loading.set(false);
      this.error.set(true);
    }
  }

  private simplifyRing(ring: Ring): Ring {
    const step = Math.max(1, Math.ceil(ring.length / 180));
    const simplified = ring.filter((_, index) => index % step === 0);
    const last = ring[ring.length - 1];
    if (last && simplified[simplified.length - 1] !== last) simplified.push(last);
    return simplified;
  }

  private syncVisitedCountries(): void {
    this.visited.clear();
    for (const code of this.visitedCountries) this.visited.add(code.toUpperCase());
    for (const code of this.visited) this.loadFlag(code);
  }

  private loadFlag(code: string): void {
    if (this.flagImages.has(code)) return;
    const image = new Image();
    image.onload = () => this.render();
    image.src = `/assets/flags/4x3/${code.toLowerCase()}.svg`;
    this.flagImages.set(code, image);
  }

  private animate(time: number): void {
    const elapsed = Math.min(50, time - this.lastFrame);
    this.lastFrame = time;
    if (this.rotating() && !this.dragging && !this.loading()) {
      this.longitude = this.wrapLongitude(this.longitude + elapsed * 0.0035);
      this.render();
    }
    this.frame = requestAnimationFrame((nextTime) => this.animate(nextTime));
  }

  private render(): void {
    if (!this.canvas) return;
    const canvas = this.canvas.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const radius = Math.min(width, height) * 0.415 * this.zoom;
    const centerX = width / 2;
    const centerY = height / 2 + height * 0.025;
    this.drawAtmosphere(context, centerX, centerY, radius);

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    this.drawGrid(context, centerX, centerY, radius);
    for (const feature of this.features.filter((feature) => !this.visited.has(feature.properties.code))) {
      this.drawCountry(context, feature, centerX, centerY, radius, false);
    }
    for (const feature of this.features.filter((feature) => this.visited.has(feature.properties.code))) {
      this.drawCountry(context, feature, centerX, centerY, radius, true);
    }
    context.restore();

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(110, 230, 207, .55)';
    context.lineWidth = 1.25;
    context.stroke();
  }

  private drawAtmosphere(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    context.save();
    context.shadowColor = 'rgba(76, 224, 194, .25)';
    context.shadowBlur = 28;
    const gradient = context.createRadialGradient(x - radius * .32, y - radius * .35, radius * .08, x, y, radius);
    gradient.addColorStop(0, '#173958');
    gradient.addColorStop(.72, '#0b2841');
    gradient.addColorStop(1, '#061929');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawGrid(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    context.strokeStyle = 'rgba(114, 169, 190, .13)';
    context.lineWidth = .65;
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      this.drawGeoLine(context, Array.from({ length: 121 }, (_, index) => [-180 + index * 3, latitude] as Position), x, y, radius);
    }
    for (let longitude = -150; longitude <= 180; longitude += 30) {
      this.drawGeoLine(context, Array.from({ length: 61 }, (_, index) => [longitude, -90 + index * 3] as Position), x, y, radius);
    }
  }

  private drawGeoLine(context: CanvasRenderingContext2D, positions: Position[], x: number, y: number, radius: number): void {
    context.beginPath();
    let drawing = false;
    for (const position of positions) {
      const point = this.project(position, x, y, radius);
      if (!point.visible) { drawing = false; continue; }
      if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      drawing = true;
    }
    context.stroke();
  }

  private drawCountry(context: CanvasRenderingContext2D, feature: GlobeFeature, x: number, y: number, radius: number, isVisited: boolean): void {
    context.beginPath();
    const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let hasVisiblePoint = false;
    for (const polygon of feature.polygons) {
      for (const ring of polygon) {
        let drawing = false;
        for (const position of ring) {
          const point = this.project(position, x, y, radius);
          if (!point.visible) { drawing = false; continue; }
          if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
          drawing = true;
          hasVisiblePoint = true;
          bounds.minX = Math.min(bounds.minX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y);
          bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.maxY = Math.max(bounds.maxY, point.y);
        }
        if (drawing) context.closePath();
      }
    }
    if (!hasVisiblePoint) return;

    if (isVisited) {
      const flag = this.flagImages.get(feature.properties.code);
      context.save();
      context.clip('evenodd');
      if (flag?.complete && flag.naturalWidth) {
        context.drawImage(flag, bounds.minX, bounds.minY, Math.max(1, bounds.maxX - bounds.minX), Math.max(1, bounds.maxY - bounds.minY));
      } else {
        context.fillStyle = '#50e3bd';
        context.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      }
      context.fillStyle = 'rgba(255, 255, 255, .08)';
      context.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      context.restore();
      context.strokeStyle = '#b7fff0';
      context.lineWidth = 1.2;
    } else {
      context.fillStyle = 'rgba(55, 83, 110, .72)';
      context.fill('evenodd');
      context.strokeStyle = 'rgba(118, 154, 180, .44)';
      context.lineWidth = .55;
    }
    context.stroke();
  }

  private project(position: Position, centerX: number, centerY: number, radius: number): ProjectedPoint {
    const radians = Math.PI / 180;
    const longitude = position[0] * radians;
    const latitude = position[1] * radians;
    const centerLongitude = this.longitude * radians;
    const centerLatitude = this.latitude * radians;
    const delta = longitude - centerLongitude;
    const cosLatitude = Math.cos(latitude);
    const depth = Math.sin(centerLatitude) * Math.sin(latitude) + Math.cos(centerLatitude) * cosLatitude * Math.cos(delta);
    return {
      x: centerX + radius * cosLatitude * Math.sin(delta),
      y: centerY - radius * (Math.cos(centerLatitude) * Math.sin(latitude) - Math.sin(centerLatitude) * cosLatitude * Math.cos(delta)),
      visible: depth >= -.006,
    };
  }

  private wrapLongitude(value: number): number {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }
}
