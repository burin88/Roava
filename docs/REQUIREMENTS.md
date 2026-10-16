# Requirement Management

Implementation of `roava_codex_requirement_handoff.md` v1.0 (2026-10-16) in the existing Angular / Node / Cloudflare Pages architecture.

## Setup and run

1. Review and run [`database/requirements.sql`](../database/requirements.sql) in the **same Supabase project as `SUPABASE_URL`**. It is transactional and repeatable. Existing tables, rows and master values are preserved. It adds the `requirement_listing` security-invoker view, grants, RLS policies, indexes and audit/validation triggers. No extra business tables or packages are needed.
2. Use existing `.env` values `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. No service-role key is used. The existing R2 configuration is needed for travel media, not Requirements. Cloudflare uses the same variable names and existing catch-all Pages Function.
3. From `Roava`: `npm.cmd start`, sign in using the existing login, and open `/requirements` or the Requirements navigation link.
4. Production build: `npm.cmd run build`. If another process locks `dist`, use `npm.cmd run build -- --output-path tmp/requirements-build`. Existing bundle/style budget warnings remain.

## Access model

The existing application isolates data by account. Requirements therefore belong to the authenticated creator: `requirements.created_by = auth.uid()::text`. PR access follows the owning Requirement. Masters are readable by signed-in accounts; UI/API lookups filter active rows, while historical joins can read inactive masters. Masters are not editable by clients. No anonymous access, hard-delete grants, service-role credentials or provider sync are introduced.

All requests reuse the existing `/auth/v1/user` token validation. PostgREST receives that same user token, so RLS also protects direct Data API calls. Audit and validation triggers prevent client-forged identity/timestamps and moving a PR to another Requirement. PR merge status never changes Requirement status.

If a shared team backlog is wanted later, define membership/roles explicitly before replacing the per-account policies. Existing non-UUID `created_by` values require an explicit owner assignment by an administrator; this setup does not silently claim historical records.

## Endpoints

Write routes require `Authorization: Bearer <existing Supabase session access token>` and JSON for request bodies. Requirement list/detail and master GETs allow anonymous requests (see the AllowAnonymous update below). They use the repository's string `error` convention with an additional `fields` object for field errors. Internal SQL details are never returned.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/masters/requirement-types` | Active types, ordered sequence DESC/code ASC |
| GET | `/api/masters/requirement-priorities` | Active priorities, same ordering |
| GET | `/api/masters/requirement-statuses` | Active statuses, same ordering |
| GET | `/api/requirements` | `page`, `page_size`, `requirement_type`, `priority`, `status`, `search`; omitted status means ALL |
| GET | `/api/requirements/:id` | Requirement with master names and active `prs`, created_at DESC/id DESC |
| POST | `/api/requirements` | Create; defaults FEATURE/MEDIUM/PENDING; 201 |
| PATCH | `/api/requirements/:id` | Partial update; unchanged inactive master allowed; 200 |
| POST | `/api/requirements/:id/prs` | Add related PR; 201; duplicate URL in same Requirement gives 409 |
| PATCH | `/api/requirement-prs/:id` | Partial PR update; parent immutable; 200 |

The list reads the database view with `ORDER BY type_sequence DESC, priority_sequence DESC, created_at ASC, id ASC` before LIMIT/OFFSET. `Prefer: count=exact` supplies the filtered total, including empty/out-of-range pages. Active PR counts are computed in SQL, without per-row HTTP queries. Search operands are quoted/escaped before being passed to PostgREST. Master code query filters must be uppercase identifiers; nonexistent well-formed codes return no matches.

## Files

- `server/requirements-api.mjs`: resource routes, validation, filtering and data access.
- `server/authenticated-api.mjs`: dispatch after existing authentication.
- `server/node-storage-api.mjs`: mount new resources in local Node adapter. Cloudflare already uses the shared handler.
- `src/app/features/requirements/requirements.{ts,html,css}`: live API UI, inline forms, PRs, filters, loading/error/retry/empty states, pagination and focus handling.
- `src/app/app.routes.ts`, `src/app/app.html`: route and navigation.
- `database/requirements.sql`: repeatable database setup.
- `scripts/test-requirements.mjs`, `package.json`: feature test command.
- `docs/REQUIREMENTS.md`: setup and verification notes.

## Automated tests

`npm.cmd run test:requirements` runs API/auth tests, UI state tests and actual PostgreSQL semantics using the same PGlite fixture location as the existing database suite. If that optional test dependency is absent, install it only in the test folder:

```powershell
npm.cmd install --prefix tmp/roava-postgres-test --no-save @electric-sql/pglite@0.3.14
npm.cmd run test:requirements
node --test scripts/test-supabase-api.mjs scripts/test-r2-media.mjs scripts/test-media-requests.mjs
```

Coverage includes repeatability, master ordering, DB-level list ordering/pagination, title validation, inactive master behavior, multiple PRs, uniqueness, HTTPS validation, audit tampering, immutable parent, account isolation, anonymous denial, no hard delete, API validation/error handling and empty-state creation. UI tests exercise component state; they do not replace visual browser acceptance.

## Manual acceptance after SQL installation

1. Sign in, open `/requirements`: with no data, verify “ยังไม่มี Requirement” and both add buttons. Open the form using either button; keyboard focus should move to Title.
2. Create a Requirement; verify defaults and API-loaded dropdown labels. Submit blank title/invalid fields; typed values must remain and errors must appear. After success, detail stays open for adding PRs.
3. Add FEATURE/CRITICAL, IMPROVEMENT/LOW and BUG/LOW. BUG must appear first. Add BUG/HIGH; it must precede BUG/LOW. Add over 20 items to verify sorting across pages.
4. Combine search, Type, Priority and Status filters; test ALL and no-match state. Existing filters must survive save. Simulate a failed API response and retry.
5. Add GitHub/Azure DevOps/GitLab PRs to one Requirement. Edit URL/repository/status; duplicate a URL to verify 409. MERGED must not complete the Requirement automatically.
6. Disable a master using an administrator SQL session. It must disappear from create/filter dropdowns; historical records must still open, retain the disabled value and permit title edits.
7. Use a different account to confirm it cannot see/update the original user's Requirements/PRs. Anonymous API calls must return 401; inactive/missing records return 404.
8. Check mobile layout, keyboard navigation and external HTTPS links (`noopener noreferrer`). Confirm the browser receives only the existing public configuration.

## Verification status (2026-10-16)

The configured remote project was inspected read-only: all five tables, foreign keys, PR uniqueness and seed codes/sequences exist; Requirements contained zero rows. RLS was enabled but no policies or audit triggers existed for these tables. Remote installation of this setup was **not applied**: automatic approval review rejected persistent changes to that project's grants/RLS/triggers/view without explicit project-specific approval. The application requires this SQL installation before the new endpoints can operate on that project. Local PostgreSQL/API/UI-state verification is separate from a remote end-to-end test.

- Feature suite: 10 tests passed.
- Related existing API/media suites: 19 tests passed.
- Production build passed with alternate output `tmp/requirements-build`; existing budget warnings remain.
- No connected browser surface was available for visual acceptance. Complete the manual checks above after installing the SQL.

## AllowAnonymous update

The user requested AllowAnonymous for `/requirements`. The page now renders outside the login/travel-data gate. Without a session, its GET requests omit Authorization. Only Requirement list/detail and the three master GET endpoints permit anonymous access; writes, media and files retain authentication. The UI explains that writing requires login, and blocks anonymous form submission. Authenticated reads retain the original account scope.

`database/requirements-anonymous-read.sql` is a separate, repeatable SQL setup for public read access. It grants only SELECT, adds anon-only read policies and the security-invoker listing view. It would make **all valid Requirements and related valid PRs public**, including titles, descriptions, URLs and audit metadata in the current response; master rows remain readable for historical joins, with lookup endpoints filtering active options. It adds no write policies or audit triggers and does not install the earlier authenticated-write setup.

Remote application of the anonymous-read SQL was also rejected by automatic approval review: route-level AllowAnonymous was not considered explicit approval to expose that full data scope publicly. Neither SQL setup has been applied remotely. Public page routing is implemented locally, but database-backed reads remain blocked until explicit approval and SQL installation. Missing view/schema responses now return an actionable 503 message instead of a generic database failure.

The updated feature/API suites pass 18 tests, including anonymous reads, denied anonymous writes/media access and local PostgreSQL public-read policies. Browser visual acceptance and live anonymous data access have not been verified.
