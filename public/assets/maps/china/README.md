# China province map

Source: [Alibaba Cloud DataV.GeoAtlas](https://datav.aliyun.com/portal?tool=atlas).
GeoJSON endpoint: https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
Retrieved: 2026-10-15.

The original source is retained at `scripts/data/china-provinces.source.geojson`.
Run `npm run generate:china-map` to reproduce `provinces.json` locally.

This drill-down shows the 31 mainland provincial-level regions, including
provinces, autonomous regions and the four directly administered municipalities.
The existing Asia catalog entries, including Taiwan, remain separate and unchanged.
Non-administrative line features from the source are excluded. Offshore polygons
entirely below latitude 17 are omitted from the display projection so the mainland
is legible; the original geometry is preserved for coordinate matching.

Path, label and bounds values use the same fitted Mercator projection. The page
loads the generated data from local assets and never calls an external map API.

Visits are derived from an optional trip `provinceCode`, recognized destination
cities, and recorded place coordinates. A journey may highlight multiple regions.
Unknown cities without province information or usable coordinates remain unassigned
and are listed in the UI for correction instead of guessing.
