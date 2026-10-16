# Thailand province map

Includes 77 administrative areas: the 76 provinces and Bangkok, including Bueng Kan.
Downloaded 16 October 2026; boundaries represent the source's 2017 snapshot.

- Boundaries: [geoBoundaries THA ADM1](https://www.geoboundaries.org/api/current/gbOpen/THA/ADM1/),
  boundary ID `THA-ADM1-36821470`, published by geoBoundaries from OpenStreetMap/Wambacher.
  The retained simplified boundary database and derived map paths are available under the
  [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- Thai/English names: [kongvut/thai-province-data](https://github.com/kongvut/thai-province-data),
  MIT license. The upstream license notice is retained in `thailand-names.LICENSE`.
- Province codes use the source's ISO 3166-2 identifiers (`TH-10`, `TH-38`, etc.),
  rather than the name dataset's internal sequential IDs.

Sources are retained in `scripts/data/thailand-provinces.source.geojson`,
`scripts/data/thailand-province-names.source.json`, and `thailand-boundaries.metadata.json`.
Rebuild locally with `node scripts/generate-thailand-map.mjs`.

Map points are representative points inside each province. Existing Bangkok,
Chiang Mai and Phuket destination coordinates are preserved. Other representative
points should not be treated as precise city-center or attraction coordinates.

Highlights come from a trip's explicit province, recognized destination name,
or the coordinates of its recorded places. They are not inferred from free-text notes.
