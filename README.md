# Atlas — Personal Travel Memory POC

Frontend-only Angular proof of concept for a seven-continent personal travel atlas.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## What is included

- Interactive MapLibre atlas with 196 geographic entries across all 7 continents
- Continent-scoped routes, country dropdowns, statistics, camera positions, GeoJSON and SVG fallbacks
- Visited country and city state derived only from trip data
- Country drill-down and City Memory pages
- China province drill-down at `/country/CN`: click China in Asia to explore 31 mainland provincial-level regions, with visited areas inferred from trips, destination cities and place coordinates
- Trip, place, expense and notes CRUD
- Development: original photos stored by the local media server in `img/travel-photos`
- Production/static hosting: photos stored in IndexedDB in the current browser/device, without a media API
- Structured travel data in `localStorage` under `travel-atlas:poc`
- Local summary generation, travel statistics, JSON import/export
- Multi-image photo import (up to 30 images), local Thai/English OCR, and reviewable trip-field analysis
- A Beijing demo journey available from the empty dashboard

## Storage boundaries

UI features depend on `TravelRepository`, `MediaStorage`, `SummaryProvider`, `OcrProvider`, and `PhotoAnalysisProvider`. The POC provides local implementations for each boundary, so an API-backed implementation can replace local providers later without rewriting feature components.

Production builds use `IndexedDbMediaStorage`, so static hosting such as Cloudflare
Pages does not require a Node media API. Photos remain on the current device/browser
and do not sync across devices. Clearing site data deletes browser-stored photos.
JSON exports contain trip details and media references, not image blobs; keep the
original images separately. Development with `npm start` retains the file-backed API.

## Smart photo import

Select **Import photos** from any continent or a City Memory page, choose multiple receipt/ticket/location images, then run OCR. Tesseract language and WebAssembly files are bundled with the app, so images stay on the device. The local analyzer suggests country, city, dates, places, expense categories, amounts, tags, and notes. Every suggestion remains editable before creating the journey; original images are saved in `img/travel-photos` through the local media server and attached to the new trip.

JSON backups currently contain structured travel data and media references. The `img/travel-photos` directory contains the corresponding local image files; a ZIP media backup is intentionally left for a later phase.

## Commands

```bash
npm start          # development server
npm run build      # production build
npm run generate:map # rebuild static GeoJSON and SVG fallback
npm run generate:china-map # rebuild China provincial paths from retained local GeoJSON
npm run test:china-map # verify province matching, map projection and trip editor integration
npm run test:beijing-plan # verify the seven-day plan, additive import and shared travel-day counting
```

## Requested Beijing–Tianjin itinerary

Opening `/beijing` or `/country/CN` adds the requested 29 October–4 November 2026
itinerary once in that browser. It creates a seven-day Beijing record and a
Tianjin companion day trip on 3 November. Both share a journey group, so aggregate
travel-day totals count seven days. Daily times, activities, transport notes and
known destination pins are derived from the same data used by `/beijing`.

The import merges missing stable IDs and preserves existing journeys, profile,
photos and edits. A separate localStorage marker prevents later automatic visits
from restoring deleted records. The `/beijing` page has an explicit add action to
restore missing itinerary records when wanted. Unspecified meals and hotels have
no invented coordinates, expenses or ratings.
