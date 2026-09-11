import { GENERATED_COUNTRY_ROWS } from './world-countries.generated';

export interface CityOption { code: string; name: string; coordinates: [number, number]; }
export type ContinentCode = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA';
export interface ContinentOption { code: ContinentCode; name: string; mapKey: string; center: [number, number]; zoom: number; }
export interface CountryOption { code: string; name: string; flag: string; continentCode: ContinentCode; cities: CityOption[]; }

export const CONTINENTS: readonly ContinentOption[] = [
  { code: 'AS', name: 'Asia', mapKey: 'asia', center: [94, 27], zoom: 2.35 },
  { code: 'AF', name: 'Africa', mapKey: 'africa', center: [20, 2], zoom: 2.5 },
  { code: 'NA', name: 'North America', mapKey: 'north-america', center: [-102, 38], zoom: 2.25 },
  { code: 'SA', name: 'South America', mapKey: 'south-america', center: [-60, -18], zoom: 2.45 },
  { code: 'EU', name: 'Europe', mapKey: 'europe', center: [16, 52], zoom: 3.1 },
  { code: 'OC', name: 'Australia / Oceania', mapKey: 'oceania', center: [151, -20], zoom: 2.35 },
  { code: 'AN', name: 'Antarctica', mapKey: 'antarctica', center: [0, -76], zoom: 1.55 },
];
export const ASIA_CONTINENT = CONTINENTS.find((continent) => continent.code === 'AS')!;
export const continentByCode = (code: string): ContinentOption => CONTINENTS.find((continent) => continent.code === code) ?? ASIA_CONTINENT;

export const ASIA_COUNTRIES: CountryOption[] = [
  ['AF','Afghanistan','🇦🇫','KABUL','Kabul',69.2075,34.5553], ['AM','Armenia','🇦🇲','YEREVAN','Yerevan',44.5152,40.1872],
  ['AZ','Azerbaijan','🇦🇿','BAKU','Baku',49.8671,40.4093], ['BH','Bahrain','🇧🇭','MANAMA','Manama',50.586,26.2285],
  ['BD','Bangladesh','🇧🇩','DHAKA','Dhaka',90.4125,23.8103], ['BT','Bhutan','🇧🇹','THIMPHU','Thimphu',89.639,27.4728],
  ['BN','Brunei','🇧🇳','BANDAR','Bandar Seri Begawan',114.9398,4.9031], ['KH','Cambodia','🇰🇭','PHNOM_PENH','Phnom Penh',104.9282,11.5564],
  ['CN','China','🇨🇳','BEIJING','Beijing',116.4074,39.9042], ['CY','Cyprus','🇨🇾','NICOSIA','Nicosia',33.3823,35.1856],
  ['GE','Georgia','🇬🇪','TBILISI','Tbilisi',44.8271,41.7151], ['IN','India','🇮🇳','DELHI','Delhi',77.1025,28.7041],
  ['ID','Indonesia','🇮🇩','JAKARTA','Jakarta',106.8456,-6.2088], ['IR','Iran','🇮🇷','TEHRAN','Tehran',51.389,35.6892],
  ['IQ','Iraq','🇮🇶','BAGHDAD','Baghdad',44.3661,33.3152], ['IL','Israel','🇮🇱','JERUSALEM','Jerusalem',35.2137,31.7683],
  ['JP','Japan','🇯🇵','TOKYO','Tokyo',139.6917,35.6895], ['JO','Jordan','🇯🇴','AMMAN','Amman',35.9106,31.9539],
  ['KZ','Kazakhstan','🇰🇿','ALMATY','Almaty',76.886,43.2389], ['KW','Kuwait','🇰🇼','KUWAIT_CITY','Kuwait City',47.9774,29.3759],
  ['KG','Kyrgyzstan','🇰🇬','BISHKEK','Bishkek',74.5698,42.8746], ['LA','Laos','🇱🇦','VIENTIANE','Vientiane',102.6331,17.9757],
  ['LB','Lebanon','🇱🇧','BEIRUT','Beirut',35.5018,33.8938], ['MY','Malaysia','🇲🇾','KUALA_LUMPUR','Kuala Lumpur',101.6869,3.139],
  ['MV','Maldives','🇲🇻','MALE','Malé',73.5093,4.1755], ['MN','Mongolia','🇲🇳','ULAANBAATAR','Ulaanbaatar',106.9057,47.8864],
  ['MM','Myanmar','🇲🇲','YANGON','Yangon',96.1951,16.8661], ['NP','Nepal','🇳🇵','KATHMANDU','Kathmandu',85.324,27.7172],
  ['KP','North Korea','🇰🇵','PYONGYANG','Pyongyang',125.7625,39.0392], ['OM','Oman','🇴🇲','MUSCAT','Muscat',58.3829,23.588],
  ['PK','Pakistan','🇵🇰','ISLAMABAD','Islamabad',73.0479,33.6844], ['PS','Palestine','🇵🇸','RAMALLAH','Ramallah',35.2034,31.9038],
  ['PH','Philippines','🇵🇭','MANILA','Manila',120.9842,14.5995], ['QA','Qatar','🇶🇦','DOHA','Doha',51.531,25.2854],
  ['SA','Saudi Arabia','🇸🇦','RIYADH','Riyadh',46.6753,24.7136], ['SG','Singapore','🇸🇬','SINGAPORE','Singapore',103.8198,1.3521],
  ['KR','South Korea','🇰🇷','SEOUL','Seoul',126.978,37.5665], ['LK','Sri Lanka','🇱🇰','COLOMBO','Colombo',79.8612,6.9271],
  ['SY','Syria','🇸🇾','DAMASCUS','Damascus',36.2765,33.5138],
  ['TJ','Tajikistan','🇹🇯','DUSHANBE','Dushanbe',68.787,38.5598], ['TH','Thailand','🇹🇭','BANGKOK','Bangkok',100.5018,13.7563],
  ['TL','Timor-Leste','🇹🇱','DILI','Dili',125.5603,-8.5569], ['TR','Türkiye','🇹🇷','ISTANBUL','Istanbul',28.9784,41.0082],
  ['TM','Turkmenistan','🇹🇲','ASHGABAT','Ashgabat',58.3261,37.9601], ['AE','United Arab Emirates','🇦🇪','DUBAI','Dubai',55.2708,25.2048],
  ['UZ','Uzbekistan','🇺🇿','TASHKENT','Tashkent',69.2401,41.2995], ['VN','Vietnam','🇻🇳','HANOI','Hanoi',105.8342,21.0278],
  ['YE','Yemen','🇾🇪','SANAA',"Sana'a",44.191,15.3694],
].map((row) => ({ code: row[0] as string, name: row[1] as string, flag: row[2] as string, continentCode: 'AS' as const, cities: [{ code: row[3] as string, name: row[4] as string, coordinates: [row[5] as number, row[6] as number] }] }));

const extras: Record<string, CityOption[]> = {
  CN: [{ code:'SHANGHAI',name:'Shanghai',coordinates:[121.4737,31.2304] },{ code:'GUANGZHOU',name:'Guangzhou',coordinates:[113.2644,23.1291] },{ code:'CHENGDU',name:'Chengdu',coordinates:[104.0665,30.5728] },{ code:'KUNMING',name:'Kunming',coordinates:[102.8329,24.8801] }],
  JP: [{ code:'KYOTO',name:'Kyoto',coordinates:[135.7681,35.0116] },{ code:'OSAKA',name:'Osaka',coordinates:[135.5023,34.6937] }],
  TH: [{ code:'CHIANG_MAI',name:'Chiang Mai',coordinates:[98.9853,18.7883] },{ code:'PHUKET',name:'Phuket',coordinates:[98.3381,7.8804] }],
  KR: [{ code:'BUSAN',name:'Busan',coordinates:[129.0756,35.1796] }], IN: [{ code:'MUMBAI',name:'Mumbai',coordinates:[72.8777,19.076] },{ code:'JAIPUR',name:'Jaipur',coordinates:[75.7873,26.9124] }],
  ID: [{ code:'BALI',name:'Bali',coordinates:[115.1889,-8.4095] }], KH: [{ code:'SIEM_REAP',name:'Siem Reap',coordinates:[103.8564,13.3671] }],
  MY: [{ code:'PENANG',name:'Penang',coordinates:[100.3327,5.4164] }], PH: [{ code:'CEBU',name:'Cebu',coordinates:[123.8854,10.3157] }],
  VN: [{ code:'HO_CHI_MINH',name:'Ho Chi Minh City',coordinates:[106.6297,10.8231] }], AE: [{ code:'ABU_DHABI',name:'Abu Dhabi',coordinates:[54.3773,24.4539] }],
};
for (const country of ASIA_COUNTRIES) country.cities.push(...(extras[country.code] ?? []));

const OTHER_COUNTRIES: CountryOption[] = GENERATED_COUNTRY_ROWS.map((row) => ({
  code: row.code,
  name: row.name,
  flag: row.flag,
  continentCode: row.continentCode,
  cities: [{ code: row.cityCode, name: row.cityName, coordinates: [row.longitude, row.latitude] }],
}));

export const COUNTRY_CATALOG: readonly CountryOption[] = [...ASIA_COUNTRIES, ...OTHER_COUNTRIES];
export const countriesByContinent = (continentCode: ContinentCode): CountryOption[] => COUNTRY_CATALOG.filter((country) => country.continentCode === continentCode);
export const countryByCode = (code: string) => COUNTRY_CATALOG.find((country) => country.code === code);
export const cityByCode = (countryCode: string, cityCode: string) => countryByCode(countryCode)?.cities.find((city) => city.code === cityCode);
