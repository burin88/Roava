# Supabase application setup

## Local configuration

Copy `.env.example` to `.env` for a new installation. The current workspace's `.env`
already has the supplied Supabase project URL and publishable key; existing R2
credentials are preserved. `.env` is ignored by Git. Restart `npm start` after edits.

| Variable | Purpose | Required |
| --- | --- | --- |
| `SUPABASE_URL` | Project HTTPS URL | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Public publishable key or legacy anon JWT | Yes |
| `CLOUDFLARE_R2_ACCOUNT_ID` | R2 S3 API account | Local Node API |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 server credential | Local Node API |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 server credential | Local Node API |
| `CLOUDFLARE_R2_BUCKET_NAME` | Actual bucket name used for attachment metadata | Yes |
| `CLOUDFLARE_R2_SERVICE_URL` | Override R2 HTTPS endpoint | Optional |
| `R2_LEGACY_OWNER_ID` | Auth UID owning photos uploaded before Auth | Only for legacy photos |

No service-role key, database password, or user password belongs in frontend config.
The server's `/api/config` returns only URL and publishable key. Email/password is
entered by the user on the login screen; the Supabase SDK handles session refresh.

## Database and login

For a fresh project run `database/create-tables.sql`, then `database/connect-app.sql`.
For an existing schema with `owner_id`, run `database/rename-owner-columns.sql` instead.
Foreign keys use `{referenced_table}_id` and point to master IDs: `profiles.users_id`
references `auth.users.id`; other ownership references use `profiles_id → profiles.id`.
Trip/place/expense/attachment references likewise use `trips_id`, `trip_places_id`,
`expenses_id`, `attachments_id`, and `journeys_id`. Restart the Node API after upgrading.
The existing project `zddtmisfzncwxaklhyvc` already has the app RPCs installed.
The original two trips and four expenses have been retained and verified through
the authenticated database role for the requested owner UID.

Start with `npm start`, open `http://localhost:4200`, and log in with the Auth
account owning the imported records. If the account uses OAuth only, configure an
email/password login for that account in Supabase before using this login screen.
The application does not create a duplicate account to bypass RLS.

Reads use `roava_read_document`; saves use `roava_write_document` in one PostgreSQL
transaction. A normal trip save only replaces that trip's child rows and links.
JSON Import replaces the account's active travel document, archiving omitted trips.
Delete and Reset use `valid=false`, not physical deletion. SQL functions use
SECURITY INVOKER and auth.uid(); client-supplied ownership is never trusted.

The app does not silently fall back to localStorage after a DB failure. Existing
localStorage backups remain untouched. Export any additional local records before
switching, then import the JSON explicitly if needed. The Beijing page's automatic
demo insertion is disabled in database mode; its explicit add action remains.

## Media

Originals and immutable owner metadata are stored in R2. Each upload registers a
ready `attachments` row in PostgreSQL; the next trip save connects it through the
link tables. Expense uploads set type=expense. Failed DB registration attempts
clean up the newly uploaded R2 original and metadata record.

Every media request requires a bearer token validated by Supabase Auth. The API
checks both an own DB attachment row and the owner in the server-written R2 record.
Generic file objects are scoped under `roava/files/<auth-uid>/`.

Existing references without bucket/path are backfilled from real R2 metadata on
first authorized read. Pre-Auth R2 records are accessible only to
`R2_LEGACY_OWNER_ID` (configured to the supplied account in this workspace).
If a referenced object is absent from R2, the API returns 404; a database reference
does not recreate missing image bytes.

DELETE on the media API acknowledges removal but retains original files. Trip saves
remove the links transactionally. This avoids deleting a file still used by another
trip/receipt and allows recovery. Unlinked originals may therefore consume storage;
physical garbage collection is intentionally a separate maintenance operation.

## Cloudflare Pages

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, and, for
existing photos, `R2_LEGACY_OWNER_ID` in the Pages environment. Bind the actual R2
bucket as `R2_STORAGE`. Local `.env` values are not uploaded to Pages. Build/deploy
the root `functions/` directory together with the Angular app as documented in README.

## Verification

```powershell
node --test scripts/test-supabase-api.mjs scripts/test-postgres-database.mjs scripts/test-postgres-import.mjs scripts/test-media-requests.mjs scripts/test-r2-media.mjs scripts/test-r2-storage.mjs scripts/test-beijing-plan.mjs scripts/test-daily-expenses.mjs scripts/test-browser-media.mjs
node node_modules/@angular/cli/bin/ng.js build --output-path tmp/supabase-build
```

The PostgreSQL tests use the optional local PGlite test dependency described in
`database/README.md`. No test needs a real user's password. Interactive sign-in is
performed by the user; no password was supplied to or stored by the agent.

The Supabase security advisor reports no table/RPC ownership issue. It separately
reports that [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
is disabled in the project's Auth settings. This setting was not changed.
