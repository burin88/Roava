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
- Trip, place, expense and notes CRUD
- Original photo files stored by the local media server in `img/travel-photos`
- Structured travel data in `localStorage` under `travel-atlas:poc`
- Local summary generation, travel statistics, JSON import/export
- Multi-image photo import (up to 30 images), local Thai/English OCR, and reviewable trip-field analysis
- A Beijing demo journey available from the empty dashboard

## Storage boundaries

UI features depend on `TravelRepository`, `MediaStorage`, `SummaryProvider`, `OcrProvider`, and `PhotoAnalysisProvider`. The POC provides local implementations for each boundary, so an API-backed implementation can replace local providers later without rewriting feature components.

## Smart photo import

Select **Import photos** from any continent or a City Memory page, choose multiple receipt/ticket/location images, then run OCR. Tesseract language and WebAssembly files are bundled with the app, so images stay on the device. The local analyzer suggests country, city, dates, places, expense categories, amounts, tags, and notes. Every suggestion remains editable before creating the journey; original images are saved in `img/travel-photos` through the local media server and attached to the new trip.

JSON backups currently contain structured travel data and media references. The `img/travel-photos` directory contains the corresponding local image files; a ZIP media backup is intentionally left for a later phase.

## Commands

```bash
npm start          # development server
npm run build      # production build
npm run generate:map # rebuild static GeoJSON and SVG fallback
```
