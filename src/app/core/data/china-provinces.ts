import type { Trip } from '../models/travel.models';

export interface ChinaProvince {
  code: string;
  name: string;
  thaiName: string;
  localName: string;
  capitalCode: string;
  capital: string;
  coordinates: [number, number];
}

export const CHINA_PROVINCES: readonly ChinaProvince[] = [
  ['110000','Beijing','ปักกิ่ง','北京','BEIJING','Beijing',116.4074,39.9042],
  ['120000','Tianjin','เทียนจิน','天津','TIANJIN','Tianjin',117.2008,39.0842],
  ['130000','Hebei','เหอเป่ย','河北','SHIJIAZHUANG','Shijiazhuang',114.5149,38.0428],
  ['140000','Shanxi','ซานซี','山西','TAIYUAN','Taiyuan',112.5489,37.8706],
  ['150000','Inner Mongolia','มองโกเลียใน','内蒙古','HOHHOT','Hohhot',111.7492,40.8426],
  ['210000','Liaoning','เหลียวหนิง','辽宁','SHENYANG','Shenyang',123.4315,41.8057],
  ['220000','Jilin','จี๋หลิน','吉林','CHANGCHUN','Changchun',125.3235,43.8171],
  ['230000','Heilongjiang','เฮย์หลงเจียง','黑龙江','HARBIN','Harbin',126.5349,45.8038],
  ['310000','Shanghai','เซี่ยงไฮ้','上海','SHANGHAI','Shanghai',121.4737,31.2304],
  ['320000','Jiangsu','เจียงซู','江苏','NANJING','Nanjing',118.7969,32.0603],
  ['330000','Zhejiang','เจ้อเจียง','浙江','HANGZHOU','Hangzhou',120.1551,30.2741],
  ['340000','Anhui','อันฮุย','安徽','HEFEI','Hefei',117.2272,31.8206],
  ['350000','Fujian','ฝูเจี้ยน','福建','FUZHOU','Fuzhou',119.2965,26.0745],
  ['360000','Jiangxi','เจียงซี','江西','NANCHANG','Nanchang',115.8582,28.6829],
  ['370000','Shandong','ซานตง','山东','JINAN','Jinan',117.1201,36.6512],
  ['410000','Henan','เหอหนาน','河南','ZHENGZHOU','Zhengzhou',113.6254,34.7466],
  ['420000','Hubei','หูเป่ย','湖北','WUHAN','Wuhan',114.3054,30.5931],
  ['430000','Hunan','หูหนาน','湖南','CHANGSHA','Changsha',112.9388,28.2282],
  ['440000','Guangdong','กวางตุ้ง','广东','GUANGZHOU','Guangzhou',113.2644,23.1291],
  ['450000','Guangxi','กว่างซี','广西','NANNING','Nanning',108.3669,22.817],
  ['460000','Hainan','ไห่หนาน','海南','HAIKOU','Haikou',110.1983,20.044],
  ['500000','Chongqing','ฉงชิ่ง','重庆','CHONGQING','Chongqing',106.5516,29.563],
  ['510000','Sichuan','เสฉวน','四川','CHENGDU','Chengdu',104.0665,30.5728],
  ['520000','Guizhou','กุ้ยโจว','贵州','GUIYANG','Guiyang',106.6302,26.647],
  ['530000','Yunnan','ยูนนาน','云南','KUNMING','Kunming',102.8329,24.8801],
  ['540000','Tibet','ทิเบต','西藏','LHASA','Lhasa',91.1409,29.6456],
  ['610000','Shaanxi','ส่านซี','陕西','XIAN',"Xi'an",108.9398,34.3416],
  ['620000','Gansu','กานซู่','甘肃','LANZHOU','Lanzhou',103.8343,36.0611],
  ['630000','Qinghai','ชิงไห่','青海','XINING','Xining',101.7782,36.6171],
  ['640000','Ningxia','หนิงเซี่ย','宁夏','YINCHUAN','Yinchuan',106.2309,38.4872],
  ['650000','Xinjiang','ซินเจียง','新疆','URUMQI','Urumqi',87.6168,43.8256],
].map(row => ({
  code: row[0] as string, name: row[1] as string, thaiName: row[2] as string,
  localName: row[3] as string, capitalCode: row[4] as string, capital: row[5] as string,
  coordinates: [row[6] as number, row[7] as number],
}));

const normalize = (name: string): string => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9\u0E00-\u0E7F\u3400-\u9FFF]/g, '');
const CITY_PROVINCES: Record<string, string> = {
  PEKING: '110000', ปักกิ่ง: '110000', 北京: '110000',
  SHENZHEN: '440000', DONGGUAN: '440000', FOSHAN: '440000', ZHUHAI: '440000',
  GUILIN: '450000', YANGSHUO: '450000', LIJIANG: '530000', DALI: '530000', XISHUANGBANNA: '530000',
  SUZHOU: '320000', WUXI: '320000', NINGBO: '330000', WENZHOU: '330000',
  XIAMEN: '350000', QUANZHOU: '350000', QINGDAO: '370000', DALIAN: '210000',
  ZHANGJIAJIE: '430000', SANYA: '460000', JIUZHAIGOU: '510000', LESHAN: '510000',
  XIAN: '610000', XI_AN: '610000', CHANGAN: '610000',
};
for (const province of CHINA_PROVINCES) {
  for (const name of [province.capitalCode, province.capital]) CITY_PROVINCES[normalize(name)] = province.code;
}

export const chinaProvinceByCode = (code?: string): ChinaProvince | undefined => CHINA_PROVINCES.find(province => province.code === code);
export const provinceForCity = (city?: string): string | undefined => city ? CITY_PROVINCES[normalize(city)] : undefined;
export const primaryProvinceForTrip = (trip: Pick<Trip, 'countryCode' | 'cityCode' | 'cityName' | 'provinceCode'>): string | undefined => {
  if (trip.countryCode !== 'CN') return undefined;
  return chinaProvinceByCode(trip.provinceCode)?.code ?? provinceForCity(trip.cityCode) ?? provinceForCity(trip.cityName);
};

export interface ProvinceShape {
  code: string;
  path: string;
  label: [number, number];
  bounds: [[number, number], [number, number]];
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}
export interface ProvinceMap { type: 'FeatureCollection'; provinces: ProvinceShape[]; }

function inRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function provinceAtCoordinates(longitude: number, latitude: number, shapes: readonly ProvinceShape[]): string | undefined {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return undefined;
  return shapes.find(shape => {
    const polygons = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates as number[][][]] : shape.geometry.coordinates as number[][][][];
    return polygons.some(rings => inRing(longitude, latitude, rings[0]) && !rings.slice(1).some(ring => inRing(longitude, latitude, ring)));
  })?.code;
}

/** A multi-stop journey can visit more than one province. Never infer visits from prose. */
export function provincesForTrip(trip: Trip, shapes: readonly ProvinceShape[]): Set<string> {
  const codes = new Set<string>();
  if (trip.countryCode !== 'CN') return codes;
  const primary = primaryProvinceForTrip(trip);
  if (primary) codes.add(primary);
  for (const place of trip.places) {
    if (typeof place.longitude !== 'number' || typeof place.latitude !== 'number') continue;
    const code = provinceAtCoordinates(place.longitude, place.latitude, shapes);
    if (code) codes.add(code);
  }
  return codes;
}
