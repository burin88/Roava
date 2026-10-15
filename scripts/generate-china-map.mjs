import fs from 'node:fs';
import { geoMercator, geoPath } from 'd3-geo';

// Source is retained locally: generation is reproducible without network access.
const source = JSON.parse(fs.readFileSync('scripts/data/china-provinces.source.geojson', 'utf8'));
const features = source.features.filter(feature => /^\d{6}$/.test(String(feature.properties.adcode)) && Number(feature.properties.adcode) <= 650000);
if (features.length !== 31) throw new Error(`Expected 31 mainland provincial-level regions, received ${features.length}`);
// GeoJSON uses counterclockwise exterior rings. d3-geo expects clockwise rings
// for regions smaller than a hemisphere; otherwise it draws the world's complement.
function orientRing(ring, hole) {
  const area = ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  return (hole ? area < 0 : area > 0) ? [...ring].reverse() : ring;
}
const display = features.map(feature => ({ ...feature, geometry: {
  type: 'MultiPolygon',
  coordinates: (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates)
    .filter(polygon => polygon[0].some(point => point[1] >= 17))
    .map(polygon => polygon.map((ring, index) => orientRing(ring, index > 0))),
} }));
const projection = geoMercator().fitExtent([[35, 35], [965, 635]], { type: 'FeatureCollection', features: display });
const draw = geoPath(projection).digits(2);
const provinces = features.map((feature, index) => ({
  code: String(feature.properties.adcode), path: draw(display[index]),
  label: projection(feature.properties.centroid ?? feature.properties.center),
  bounds: draw.bounds(display[index]), geometry: feature.geometry,
}));
fs.mkdirSync('public/assets/maps/china', { recursive: true });
fs.writeFileSync('public/assets/maps/china/provinces.json', JSON.stringify({ type: 'FeatureCollection', provinces }));
console.log(`Generated ${provinces.length} provincial map paths and coordinate boundaries`);
