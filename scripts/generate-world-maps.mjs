import fs from 'node:fs';
import path from 'node:path';
import { feature } from 'topojson-client';
import { geoAzimuthalEqualArea, geoCentroid, geoMercator, geoPath } from 'd3-geo';
import world from 'world-atlas/countries-50m.json' with { type: 'json' };
import countries from 'world-countries';

const definitions = [
  {
    code: 'AS', key: 'asia', name: 'Asia',
    codes: 'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE',
  },
  {
    code: 'AF', key: 'africa', name: 'Africa',
    codes: 'DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW',
  },
  {
    code: 'NA', key: 'north-america', name: 'North America',
    codes: 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US',
  },
  {
    code: 'SA', key: 'south-america', name: 'South America',
    codes: 'AR BO BR CL CO EC GY PY PE SR UY VE',
  },
  {
    code: 'EU', key: 'europe', name: 'Europe',
    codes: 'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA',
  },
  {
    code: 'OC', key: 'oceania', name: 'Australia / Oceania',
    codes: 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU',
  },
  { code: 'AN', key: 'antarctica', name: 'Antarctica', codes: 'AQ' },
].map((item) => ({ ...item, codes: item.codes.split(' ') }));

const metadataByCode = new Map(countries.map((country) => [country.cca2, country]));
const numericToCode = new Map(countries.filter((country) => country.ccn3).map((country) => [country.ccn3, country.cca2]));
const worldCollection = feature(world, world.objects.countries);

const cityCode = (name, countryCode) => {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
  return normalized || `${countryCode}_MEMORY`;
};

const generatedRows = [];

for (const continent of definitions) {
  const wanted = new Set(continent.codes);
  const rawFeatures = worldCollection.features
    .map((item) => ({ item, code: numericToCode.get(String(item.id).padStart(3, '0')) }))
    .filter(({ code }) => code && wanted.has(code))
    .map(({ item, code }) => {
      const meta = metadataByCode.get(code);
      return { ...item, properties: { ...item.properties, code, name: meta?.name.common ?? item.properties.name } };
    });
  const grouped = new Map();
  for (const item of rawFeatures) {
    const code = item.properties.code;
    const polygons = item.geometry.type === 'Polygon' ? [item.geometry.coordinates] : item.geometry.coordinates;
    const current = grouped.get(code);
    if (current) current.geometry.coordinates.push(...polygons);
    else grouped.set(code, { ...item, geometry: { type: 'MultiPolygon', coordinates: [...polygons] } });
  }
  const features = [...grouped.values()];

  const found = new Set(features.map((item) => item.properties.code));
  const missing = continent.codes.filter((code) => !found.has(code));
  for (const code of missing) {
    const meta = metadataByCode.get(code);
    if (!meta?.latlng) throw new Error(`${continent.name} is missing map geometry and coordinates for ${code}`);
    const [latitude, longitude] = meta.latlng;
    const radius = .32;
    features.push({
      type: 'Feature',
      properties: { code, name: meta.name.common, approximateGeometry: true },
      geometry: { type: 'Polygon', coordinates: [[
        [longitude, latitude + radius], [longitude + radius, latitude],
        [longitude, latitude - radius], [longitude - radius, latitude],
        [longitude, latitude + radius],
      ]] },
    });
    console.warn(`Using an approximate display geometry for ${meta.name.common}`);
  }
  for (const item of features) item.properties.label = geoCentroid(item);

  const collection = { type: 'FeatureCollection', features };
  const target = path.join('public', 'assets', 'maps', continent.key);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'countries.geojson'), JSON.stringify(collection));

  const projection = continent.code === 'AN'
    ? geoAzimuthalEqualArea().rotate([0, 90]).fitExtent([[42, 36], [1158, 564]], collection)
    : geoMercator().fitExtent([[42, 36], [1158, 564]], collection);
  const draw = geoPath(projection);
  const countryPaths = features.map((item) => `<path data-code="${item.properties.code}" d="${draw(item)}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#092322"/><stop offset="1" stop-color="#061918"/></linearGradient><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#31504a" stroke-opacity=".13"/></pattern></defs><rect width="1200" height="600" fill="url(#sea)"/><rect width="1200" height="600" fill="url(#grid)"/><g fill="#294440" stroke="#0b2928" stroke-width="1">${countryPaths}</g></svg>`;
  fs.writeFileSync(path.join(target, 'countries.svg'), svg);

  if (continent.code !== 'AS') {
    for (const code of continent.codes) {
      const meta = metadataByCode.get(code);
      if (!meta) throw new Error(`Missing country metadata for ${code}`);
      const capital = meta.capital?.[0] || (code === 'AQ' ? 'Research Stations' : `${meta.name.common} Memory`);
      generatedRows.push({
        code,
        name: meta.name.common,
        flag: meta.flag,
        continentCode: continent.code,
        cityCode: cityCode(capital, code),
        cityName: capital,
        longitude: code === 'AQ' ? 0 : Number(meta.latlng?.[1] ?? 0),
        latitude: code === 'AQ' ? -75 : Number(meta.latlng?.[0] ?? 0),
      });
    }
  }

  console.log(`Generated ${features.length} ${continent.name} country features`);
}

generatedRows.sort((a, b) => a.continentCode.localeCompare(b.continentCode) || a.name.localeCompare(b.name));
const ts = `// Generated by scripts/generate-world-maps.mjs. Do not edit by hand.\nexport const GENERATED_COUNTRY_ROWS = ${JSON.stringify(generatedRows, null, 2)} as const;\n`;
fs.writeFileSync(path.join('src', 'app', 'core', 'data', 'world-countries.generated.ts'), ts);
console.log(`Generated ${generatedRows.length} non-Asia country catalog rows`);
