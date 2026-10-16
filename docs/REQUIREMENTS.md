# Requirement Management

Current implementation: shared Requirements and related PR management with anonymous read/create/update support for third-party integrations. This replaces the earlier read-only and PR-update-only access designs.

## Current deployment status

Code and SQL are prepared for release. Feature/auth/media tests pass (25 tests), and production build passes using `tmp/requirements-direct-build` with existing bundle/style warnings. Source publication does not install the remote database policies; live anonymous behavior still requires SQL installation and application deployment.

The remote project `zddtmisfzncwxaklhyvc` has the base authenticated policies installed. Anonymous access is not installed. Automatic approval review rejected the anonymous SQL migration because public access to all active Requirements/PRs and anonymous creation/updates to existing records need explicit approval of that data scope. No remote permission changes were applied in this update. Live third-party requests and visual browser acceptance remain unverified.

## Access model

All supported Requirements API operations accept requests without an Authorization header. This is a shared public backlog: every active Requirement and related active PR is readable and editable by anonymous callers, including previously created records. Responses include titles, descriptions, URLs and audit metadata. Master data is read-only; master lookup endpoints return active options while historical joins can read inactive masters.

Requirements, PR and related master routes dispatch directly to their resource handler before authentication. There is no AllowAnonymous method/path authorization check and no token validation for these resources. Supplied Authorization headers are ignored and never forwarded to Supabase. The Requirements UI does not initialize Auth or request/send a token. Unsupported methods still return 405 from the resource handler; input validation, missing-record checks and database error handling remain.

All application writes receive `created_by` / `modified_by = anonymous`, regardless of browser login. Database triggers generate creation identity/time, preserve creation metadata on updates and set modification metadata. Direct Supabase clients remain subject to the configured database role, grants and RLS. Removing API checks does not bypass RLS or grant the anon database role new privileges.

Media, files, travel data and other APIs retain existing authentication and account isolation. No DELETE endpoint or public delete policy is introduced. Browser and backend use only the existing publishable/anon key; no service-role key is used.

## Setup and run

1. On the project configured by `SUPABASE_URL`, install `database/requirements.sql` if not already installed.
2. After explicit approval of the public data/mutation scope, install `database/requirements-anonymous.sql`. It is transactional and repeatable, checks that the base validation triggers exist, adds public RLS policies, field-specific anonymous write grants, audit triggers and the security-invoker listing view. It preserves rows and master values. The older `requirements-anonymous-read.sql` and `requirement-prs-anonymous-update.sql` are not required for this setup. Do not rerun the base SQL after the public setup without reapplying the public setup, because the base revokes public grants.
3. Use the existing `.env` variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Set the same values in Cloudflare Pages deployment configuration. Existing R2 variables remain for travel media; Requirements does not initialize R2.
4. From `Roava`, run `npm.cmd start` and open `/requirements`. The page renders outside the login/travel-data gate and permits anonymous creation/editing.
5. Build with `npm.cmd run build`. If `dist` is locked, use `npm.cmd run build -- --output-path tmp/requirements-public-build`.

## Endpoints

Base URL: `https://roava.pages.dev` after deployment. Send `Content-Type: application/json` for POST/PATCH. No login, access token or API key is required for these application endpoints once code and database policies are installed.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/masters/requirement-types` | Active types, sort sequence DESC/code ASC |
| GET | `/api/masters/requirement-priorities` | Active priorities, same ordering |
| GET | `/api/masters/requirement-statuses` | Active statuses, same ordering |
| GET | `/api/requirements` | Filters `page`, `page_size`, `requirement_type`, `priority`, `status`, `search`; omitted status means ALL |
| GET | `/api/requirements/:id` | Requirement with master names and active `prs`, ordered created_at DESC/id DESC |
| POST | `/api/requirements` | Create; defaults FEATURE/MEDIUM/PENDING; returns 201 and Requirement UUID |
| PATCH | `/api/requirements/:id` | Partial update; unchanged inactive master allowed; returns 200 |
| POST | `/api/requirements/:id/prs` | Add PR to an existing active Requirement; returns 201 and PR UUID |
| PATCH | `/api/requirement-prs/:id` | Partial PR update; immutable parent; returns 200 |

The list uses database ordering by type sequence DESC, priority sequence DESC, created_at ASC, id ASC before LIMIT/OFFSET. Exact filtered count supplies pagination. Active PR counts are computed in SQL. PR URL duplicates within one Requirement return 409. URLs must be absolute HTTPS; provider is GITHUB/AZURE_DEVOPS/GITLAB and PR status is OPEN/MERGED/CLOSED. Merging a PR does not change Requirement status. API writes ignore client identity/audit/valid fields; column grants and triggers protect direct Data API writes too.

Errors use the existing string `error` convention with an additional `fields` object. Malformed input is 400, field/master validation is 422, missing/inactive records are 404, duplicate PR URLs are 409, and missing database setup is 503. SQL details and secrets are not returned.

## Third-party example

Create a Requirement (Windows CMD):

```bat
curl.exe -X POST "https://roava.pages.dev/api/requirements" ^
  -H "Content-Type: application/json" ^
  --data-raw "{\"title\":\"Fix login error\",\"requirement_type\":\"BUG\",\"priority\":\"HIGH\"}"
```

Use the returned Requirement UUID to add a PR:

```bat
curl.exe -X POST "https://roava.pages.dev/api/requirements/REQUIREMENT_UUID/prs" ^
  -H "Content-Type: application/json" ^
  --data-raw "{\"provider\":\"GITHUB\",\"repository_name\":\"burin88/Roava\",\"pr_number\":\"42\",\"pr_url\":\"https://github.com/burin88/Roava/pull/42\"}"
```

Use the returned PR UUID for later updates:

```bat
curl.exe -X PATCH "https://roava.pages.dev/api/requirement-prs/PR_UUID" ^
  -H "Content-Type: application/json" ^
  --data-raw "{\"pr_status\":\"MERGED\"}"
```

These examples require deployment and public database setup first. They are backend/curl integrations; cross-origin browser integrations additionally require a deliberate CORS configuration, which this change does not add.

## Files and tests

- `server/requirements-api.mjs`: resource routing, handlers, input validation and database requests, without authentication checks.
- `server/authenticated-api.mjs`: Requirements dispatch before Auth; other resources still validate bearer identity.
- `server/node-storage-api.mjs`: local Node mounting; Cloudflare uses the existing shared Pages function.
- `src/app/features/requirements/requirements.{ts,html,css}`: API-backed list, filters, forms, PRs, pagination and loading/error/empty states.
- `src/app/app.{ts,html}`, `src/app/app.routes.ts`: public page routing and navigation.
- `database/requirements.sql`: base schema/seed, validation and authenticated audit setup.
- `database/requirements-anonymous.sql`: current shared public read/create/update setup.
- `scripts/test-requirements.mjs`: API, UI state and PostgreSQL tests.

Run `npm.cmd run test:requirements`. Database tests use the same optional PGlite test fixture location as the existing repository tests. If missing, install it with `npm.cmd install --prefix tmp/roava-postgres-test --no-save @electric-sql/pglite@0.3.14`.

Related verification: `node --test scripts/test-requirements.mjs scripts/test-supabase-api.mjs scripts/test-r2-media.mjs` (25 tests passed). Coverage includes public create/read/update for both resources, ignored Authorization headers without Auth calls, field validation, URL uniqueness, immutable PR parent, anonymous audit forgery protection, unchanged creation audit, disabled masters, database ordering/pagination, shared access from signed-in database accounts, unsupported DELETE/master mutations, and unchanged protection of media/file APIs. UI state tests are not visual browser acceptance.

After deployment, verify anonymous create -> add PR -> edit PR -> edit Requirement, lookup loading, empty-state add buttons, validation preservation, filters/pagination, inactive master history, mobile layout, keyboard navigation and safe external links. Verify that media/files still require login. Keep `.env` and private import SQL out of Git.
