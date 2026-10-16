import type { Trip } from '../models/travel.models';
import { provinceAtCoordinates, type ProvinceShape } from './china-provinces';
import { THAILAND_PROVINCES } from './thailand-provinces.generated';
export { THAILAND_PROVINCES, type ThailandProvince } from './thailand-provinces.generated';
export type { ProvinceMap, ProvinceShape } from './china-provinces';

const normalize=(value:string):string=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9\u0E00-\u0E7F]/g,'');
const cities:Record<string,string>={};
for(const p of THAILAND_PROVINCES) for(const name of [p.name,p.thaiName,p.capitalCode,p.code,p.code.slice(3)]) cities[normalize(name)]=p.code;
for(const [name,code] of Object.entries({กรุงเทพ:'TH-10',กทม:'TH-10',BKK:'TH-10',KRUNGTHEP:'TH-10',
  AYUTTHAYA:'TH-14',อยุธยา:'TH-14',KORAT:'TH-30',โคราช:'TH-30',PATTAYA:'TH-20',พัทยา:'TH-20',
  HUAHIN:'TH-77',หัวหิน:'TH-77',HATYAI:'TH-90',หาดใหญ่:'TH-90',KOH_SAMUI:'TH-84',เกาะสมุย:'TH-84',
  PHANG_NGA:'TH-82',BURIRAM:'TH-31',SISAKET:'TH-33',LOPBURI:'TH-16'}))cities[normalize(name)]=code;
export const thaiProvinceByCode=(code?:string)=>THAILAND_PROVINCES.find(p=>p.code===code||p.code.slice(3)===code);
export const thaiProvinceForCity=(city?:string):string|undefined=>city?cities[normalize(city.replace(/^จังหวัด\s*|^จ\.\s*/,''))]:undefined;
export function primaryThaiProvinceForTrip(trip:Pick<Trip,'countryCode'|'provinceCode'|'cityCode'|'cityName'>):string|undefined {
  return trip.countryCode==='TH' ? thaiProvinceByCode(trip.provinceCode)?.code??thaiProvinceForCity(trip.cityCode)??thaiProvinceForCity(trip.cityName):undefined;
}
export function thaiProvincesForTrip(trip:Trip,shapes:readonly ProvinceShape[]):Set<string> {
  const codes=new Set<string>();
  if(trip.countryCode!=='TH')return codes;
  const primary=primaryThaiProvinceForTrip(trip);if(primary)codes.add(primary);
  for(const place of trip.places) if(typeof place.longitude==='number'&&typeof place.latitude==='number') {
    const code=provinceAtCoordinates(place.longitude,place.latitude,shapes);if(code)codes.add(code);
  }
  return codes;
}
