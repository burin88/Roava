import { BEIJING_ITINERARY, ItineraryDay, ItineraryStop } from './beijing-itinerary';
import type { Place, TravelDocument, Trip } from '../models/travel.models';

export const BEIJING_PLAN_KEY = 'travel-atlas:requested-beijing-tianjin-2026:v1';
export const BEIJING_PLAN_GROUP = 'beijing-tianjin-autumn-2026';
export const BEIJING_TRIP_ID = `${BEIJING_PLAN_GROUP}:beijing`;
export const TIANJIN_TRIP_ID = `${BEIJING_PLAN_GROUP}:tianjin`;

// Destination coordinates are for map placement, not entrance/meeting points.
// Unspecified hotels, meals and transport activities intentionally have no pin.
const COORDINATES: Record<string, [number, number]> = {
  '1:0': [116.6031,40.0799], '1:2': [116.4173,39.9474], '1:4': [116.388,39.9255],
  '2:1': [116.5704,40.4319],
  '3:0': [116.3972,39.9163], '3:2': [116.3969,39.9251], '3:3': [116.385,39.9397],
  '4:0': [116.2755,39.9999], '4:2': [116.4066,39.8822], '4:3': [116.4113,39.9137],
  '5:1': [116.6743,39.8557],
  '6:1': [116.3365,39.9385], '6:3': [116.3785,39.8652],
  '6:5': [117.195,39.1367], '6:6': [117.1799,39.1532], '6:7': [117.2108,39.135],
  '7:0': [116.494,39.984], '7:2': [116.397,39.899],
};

function dateForDay(day: ItineraryDay): string {
  const [date, month] = day.date.split('/');
  return `2026-${month}-${date}`;
}

function stopPlace(day: ItineraryDay, stop: ItineraryStop, index: number): Place {
  const coordinates = COORDINATES[`${day.number}:${index}`];
  return {
    id: `${BEIJING_PLAN_GROUP}:day-${day.number}:stop-${index}`,
    name: stop.name,
    visitedAt: dateForDay(day),
    time: /^\d{2}:\d{2}$/.test(stop.time) ? stop.time : undefined,
    ...(coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : {}),
    note: [stop.detail, stop.metro ? `MRT ${stop.metro}` : '', !/^\d{2}:\d{2}$/.test(stop.time) ? stop.time : ''].filter(Boolean).join(' · ') || `Day ${day.number} · ${day.title}`,
    tags: ['itinerary', `day-${day.number}`],
    mediaIds: [],
  };
}

function dayNotes(day: ItineraryDay): string {
  return [
    `Day ${day.number} · ${dateForDay(day)} (${day.weekday}) — ${day.title}`,
    day.subtitle,
    `อากาศตามแผนต้นฉบับ ${day.temperature}C · ${day.forecast}`,
    ...day.stops.map(stop => `${stop.time} ${stop.name}${stop.detail ? ' — ' + stop.detail : ''}${stop.metro ? ' · MRT ' + stop.metro : ''}`),
    day.tip ? `เตรียมตัว: ${day.tip}` : '',
  ].filter(Boolean).join('\n');
}

export function createBeijingTianjinTrips(now = new Date().toISOString()): Trip[] {
  const beijingPlaces: Place[] = [];
  const tianjinPlaces: Place[] = [];
  for (const day of BEIJING_ITINERARY) {
    day.stops.forEach((stop, index) => {
      (day.number === 6 && index >= 5 ? tianjinPlaces : beijingPlaces).push(stopPlace(day, stop, index));
    });
  }
  beijingPlaces.push({ id: `${BEIJING_PLAN_GROUP}:sanlitun`, name: 'เดินเล่น Sanlitun / Taikoo Li', visitedAt: '2026-10-29', time: '20:30', latitude: 39.936, longitude: 116.455, note: 'เดินเล่น ช้อปปิ้ง และชมบรรยากาศยามค่ำหลังอาหารเย็น', tags: ['day-1','itinerary'], mediaIds: [] });
  beijingPlaces.push({ id: `${BEIJING_PLAN_GROUP}:return-from-tianjin`, name: 'กลับถึงปักกิ่ง / พักผ่อน', visitedAt: '2026-11-03', time: '22:15', note: 'เวลาประมาณการหลังรถไฟกลับจากเทียนจิน ขึ้นกับรอบรถจริง', tags: ['day-6','itinerary'], mediaIds: [] });
  tianjinPlaces.unshift({ id: `${BEIJING_PLAN_GROUP}:tianjin-arrival`, name: 'ถึงเทียนจิน (Tianjin Railway Station)', visitedAt: '2026-11-03', time: '16:30', latitude: 39.135, longitude: 117.2108, note: 'ถึงประมาณ 16:30–17:00 · รถไฟความเร็วสูงจาก Beijing South ใช้เวลาประมาณ 30–40 นาที', tags: ['day-6','itinerary'], mediaIds: [] });
  const order = (places: Place[]) => places.sort((a,b) => a.visitedAt.localeCompare(b.visitedAt) || (a.time ?? '12:00').localeCompare(b.time ?? '12:00'));
  const common = { countryCode: 'CN', journeyGroupId: BEIJING_PLAN_GROUP, expenses: [], mediaIds: [], createdAt: now, updatedAt: now };
  return [
    {
      ...common, id: BEIJING_TRIP_ID, name: 'ปักกิ่ง 7 วัน 6 คืน · Autumn 2026',
      cityCode: 'BEIJING', cityName: 'Beijing', provinceCode: '110000',
      startDate: '2026-10-29', endDate: '2026-11-04',
      description: 'แผนเที่ยวปักกิ่ง–เทียนจิน 7 วัน 6 คืนจากหน้า /beijing: วัดลามะ กำแพงเมืองจีน พระราชวังต้องห้าม พระราชวังฤดูร้อน Universal Beijing แพนด้า และย่านศิลปะ 798',
      notes: `แผนการเดินทางจาก /beijing · 29 ต.ค.–4 พ.ย. 2026\nวันที่ 3 พ.ย. แยกกิจกรรมช่วงเย็นไว้ในทริปเทียนจินที่ผูกกับการเดินทางชุดเดียวกัน\nที่พักและร้านอาหารเป็นตัวเลือกตามต้นฉบับ ยังไม่มีข้อมูลการจองหรือค่าใช้จ่ายจริง\n\n${BEIJING_ITINERARY.map(dayNotes).join('\n\n')}`,
      transport: 'เที่ยวบินกรุงเทพฯ–PEK · MRT + Didi · รถไฟความเร็วสูง Beijing South–Tianjin ไปกลับวันที่ 3 พ.ย.',
      hotel: 'ตัวเลือกตามแผน: Crystal Orange Sanlitun / Taikoo Li Beijing (ยังไม่ยืนยันการจอง)',
      restaurant: 'ตัวเลือกตามแผน: Long Time Ago / Rhapsody · Yan Wai Yan Beijing',
      ticket: 'เตรียมจอง Forbidden City, Mutianyu Cable Car / Toboggan, Universal Beijing และรถไฟไป–กลับเทียนจิน',
      route: BEIJING_ITINERARY.map(day => `Day ${day.number}: ${day.subtitle}`).join('\n'),
      tags: ['ปักกิ่ง','เทียนจิน','7-days','autumn-2026','itinerary'], places: order(beijingPlaces),
    },
    {
      ...common, id: TIANJIN_TRIP_ID, name: 'เทียนจิน · Day 6 จากทริปปักกิ่ง',
      cityCode: 'TIANJIN', cityName: 'Tianjin', provinceCode: '120000',
      startDate: '2026-11-03', endDate: '2026-11-03',
      description: 'เที่ยวเทียนจินช่วงบ่าย–ค่ำของวันที่ 6: Italian Style Town และ Tianjin Eye แล้วนั่งรถไฟกลับปักกิ่ง',
      notes: `ส่วนหนึ่งของทริปปักกิ่ง–เทียนจิน 7 วัน 6 คืน ไม่ใช่วันเดินทางเพิ่มเติม\nช่วงเช้า 09:00–12:30 เที่ยว Beijing Zoo ชมแพนด้า ก่อนเดินทางไปสถานี Beijing South เวลา 14:45\n16:00 รถไฟความเร็วสูงไปเทียนจิน (ประมาณ 30–40 นาที)\n16:30–17:00 ถึงเทียนจิน\n17:00 เดินเล่น Italian Style Town ชมสถาปัตยกรรมยุโรป\n19:00 Tianjin Eye ชมวิวแสงไฟยามค่ำ\n21:30 รถไฟกลับปักกิ่ง (ประมาณ 30–40 นาที)\nหลัง 22:15 กลับถึงปักกิ่ง ขึ้นกับรอบรถจริง\nอากาศตามแผน 2–12°C หนาว ลมแรง เตรียมเสื้อกันหนาวและพาสปอร์ตสำหรับรถไฟ`,
      transport: 'รถไฟความเร็วสูง Beijing South ↔ Tianjin · Didi / รถสาธารณะในเมือง',
      route: 'Beijing South → Tianjin Railway Station → Italian Style Town → Tianjin Eye → Tianjin Railway Station → Beijing',
      ticket: 'จองรถไฟไป–กลับล่วงหน้า; ตรวจสอบรอบรถและเวลา Tianjin Eye ก่อนเดินทาง',
      tags: ['เทียนจิน','day-trip','day-6','autumn-2026','itinerary'], places: order(tianjinPlaces),
    },
  ];
}

/** Add missing records only; preserve edits, photos, unrelated journeys and profile. */
export function mergeBeijingPlan(document: TravelDocument, now?: string): { document: TravelDocument; added: number } {
  const ids = new Set(document.trips.map(trip => trip.id));
  const additions = createBeijingTianjinTrips(now).filter(trip => !ids.has(trip.id));
  return { document: { ...document, trips: [...document.trips, ...additions] }, added: additions.length };
}
