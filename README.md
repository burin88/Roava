# Atlas — Personal Travel Memory POC

Angular proof of concept for a seven-continent personal travel atlas, with an R2-backed media API.

## Supabase connection

Travel records now use Supabase PostgreSQL with email/password login and owner-scoped RLS.
Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`; the Node API exposes
only these public values through `/api/config`. No service-role key is required.
Run `database/create-tables.sql` for a fresh database, then `database/connect-app.sql`
to install the transactional application RPCs. See [docs/SUPABASE.md](docs/SUPABASE.md).

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Cloudflare R2 file API

Requires Node.js 22.16+ (or the Node version required by Angular). Copy
`.env.example` to `.env` in this directory and fill in the R2 account ID, S3 API
access key ID, secret access key, and bucket name. The optional service URL defaults
to `https://<AccountId>.r2.cloudflarestorage.com`. The bucket must already exist and
the R2 credentials must have object read/write permissions for that bucket.
`.env` is ignored by Git and loaded only by the Node server; environment variables
set by the hosting platform take precedence. Restart the server after changing it.

Run `npm start` for Angular and the API together, or `npm run media` for the API
alone at `http://127.0.0.1:4300`. Angular's existing `/api` proxy forwards file requests.

- `POST /api/files`: send the raw file bytes (not multipart), its MIME type in
  `Content-Type`, and `encodeURIComponent(file.name)` in `X-File-Name`. Supports
  nonempty files up to 25 MiB. Returns `201` with `{ id, key, fileName, contentType,
  size, etag?, url }`. Each upload receives a new UUID under `roava/files/`.
- `GET /api/files/:id`: streams the original bytes as an attachment; returns `404`
  for an unknown file. Files stay in a private bucket and are read through the API.
- Missing configuration returns `503`; R2 request failures return `502` without
  exposing credentials or upstream SDK errors.

Call the Angular service from future features:

```ts
import { inject } from '@angular/core';
import { R2StorageService } from './core/storage/r2-storage.service';

private readonly files = inject(R2StorageService);

async upload(file: File) {
  const saved = await this.files.write(file);
  const original: Blob = await this.files.read(saved.id);
  // Persist saved.id in the feature's own record for later reads.
}
```

Server-side code uses `getR2StorageService()` from
`server/services/r2-storage.service.mjs`, then `write(key, buffer, { fileName,
contentType })` or `read(key)` (returns `null` when missing). The SDK and all R2
configuration remain behind that service. The implementation follows
[Cloudflare's AWS SDK v3 integration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

All photo flows (gallery, place photos, expense receipts, smart import) use
`ApiMediaStorage` in development and production. `POST /api/media` stores originals
under `roava/media/YYYY/MM/<uuid>.<ext>` using the UTC upload month. Photo metadata
is stored under `roava/media/records/<uuid>.json`, preserving trip/place IDs,
original file name and capture date across server restarts.
`GET /api/media/:id/meta` returns metadata, `GET /api/media/:id` streams the image
inline, `DELETE /api/media/:id` deletes both original and metadata, and
`DELETE /api/media` clears media records/originals without deleting generic files
or other apps' objects. No new photo or index is written to `img/` or IndexedDB.
API/configuration failures surface to the user instead of falling back to local writes.

### Cloudflare Pages

The repository includes `functions/api/[[path]].js`, sharing the same media/file
API with the Node server through `R2BindingStorageService`.

1. Deploy with Pages Git integration (root directory: this repository;
   build: `npm run build`; output: `dist/asia-travel-atlas/browser`) so the root
   `functions/` directory is compiled along with the Angular build. Uploading only
   the static build through the dashboard does not deploy these Functions.
2. In Workers & Pages, select the Pages project, then Settings > Bindings > Add >
   R2 bucket. Set the binding name to **`R2_STORAGE`** and choose your bucket.
   Configure Production and Preview with their intended buckets and redeploy.
3. This native binding supplies the bucket object; S3 access key secrets are only
   needed for the local Node API or a separately hosted Node API. Do not enter
   `R2_STORAGE` as a text variable or put R2 credentials in Angular/public assets.

See [Cloudflare Pages R2 bindings](https://developers.cloudflare.com/pages/functions/bindings/#r2-buckets).
Both APIs validate Supabase bearer tokens and check R2 object ownership. Set
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `CLOUDFLARE_R2_BUCKET_NAME` in Pages
environment variables. If retaining pre-Auth photos, also set `R2_LEGACY_OWNER_ID`
to their actual owner's Auth UID. A separately hosted Node API must be routed
to the frontend's same-origin `/api` path.

### Existing photos

After configuring local R2 credentials, run `npm run migrate:media` once to copy
photos indexed in `img/travel-photos/media-index.json` to R2. It preserves photo
IDs used by trips, places and receipts, skips already migrated IDs and retains
the original files. The API no longer serves `/img/travel-photos` URLs. Migrate
before using trips with local photo references on the new API.
The authenticated app does not fall back to another account's browser media.
Migrate legacy browser photos to R2 before relying on them across devices.

Run `npm run test:r2` for configuration, storage and HTTP upload/download tests.
These exercise Node and Pages APIs, SDK requests and storage adapters with test
fixtures; they do not contact a real R2 bucket.

## What is included

- Interactive MapLibre atlas with 196 geographic entries across all 7 continents
- Continent-scoped routes, country dropdowns, statistics, camera positions, GeoJSON and SVG fallbacks
- Visited country and city state derived only from trip data
- Country drill-down and City Memory pages
- China province drill-down at `/country/CN`: click China in Asia to explore 31 mainland provincial-level regions, with visited areas inferred from trips, destination cities and place coordinates
- Thailand province drill-down at `/country/TH`: click Thailand in Asia or select it from the country dropdown to explore all 77 provinces, search Thai/English names, add province-specific journeys, and highlight saved visits. Existing Bangkok/Chiang Mai/Phuket trips remain compatible; Supabase uses the existing `province_code` column.
- Trip, place, expense and notes CRUD
- Original photos and media metadata stored on Cloudflare R2 through the media API
- Node API for development; Pages Functions with an R2 binding on Cloudflare Pages
- Structured travel data in Supabase PostgreSQL, protected by owner-scoped RLS
- Local summary generation, travel statistics, JSON import/export
- Multi-image photo import (up to 30 images), local Thai/English OCR, and reviewable trip-field analysis
- A Beijing demo journey available from the empty dashboard

## Storage boundaries

UI features depend on `TravelRepository`, `MediaStorage`, `SummaryProvider`, `OcrProvider`, and `PhotoAnalysisProvider`. Travel data uses `SupabaseTravelRepository`; media uses the authenticated R2 API. Summaries, OCR and analysis run locally.

Development and production use `ApiMediaStorage`. Both the API and its R2 configuration
must be available for new uploads. Travel records are stored in Supabase;
JSON exports contain trip details and media IDs, without image blobs. Photos can
be read from another device by signing into the same account against the same R2 API.

## Smart photo import

Select **Import photos** from any continent or a City Memory page, choose multiple receipt/ticket/location images, then run OCR. Tesseract language and WebAssembly files are bundled with the app, so OCR runs on the device. The local analyzer suggests country, city, dates, places, expense categories, amounts, tags, and notes. Every suggestion remains editable before creating the journey; on save, originals are uploaded through the API to R2 and attached to the new trip.

JSON backups contain structured travel data and media references. Original images
remain in the configured R2 bucket; a ZIP media backup is left for a later phase.

## Commands

```bash
npm start          # development server
npm run build      # production build
npm run generate:map # rebuild static GeoJSON and SVG fallback
npm run generate:china-map # rebuild China provincial paths from retained local GeoJSON
npm run generate:thailand-map # rebuild all 77 Thai provincial paths and bilingual catalog
npm run test:thailand-map # verify province coverage, highlights, editor and country routing
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
