# Maintenance

## Current application

Edit browser source in public/, routing in server/application.mjs, authentication in server/local-auth.mjs and calendar integration in server/calendar-service.mjs. worker/index.mjs binds the application to D1. scripts/build-worker.mjs embeds an explicit UI allowlist and produces dist/server/index.js. Do not hand-edit generated assets or bundled output.

Use Node 24 or newer. Before release:

    npm ci
    npm test
    npm run check
    npm run build

npm start and npm run dev build and launch the local HTTPS application at https://localhost:8781 with a temporary self-signed certificate. Local SQLite and its encryption key persist under ignored .local/; do not remove that directory during routine updates. npm run preview reuses already generated UI assets. auth:start starts the retained future SAML backend, not the current account application.

Production uses the exact APP_ORIGIN, persistent D1 binding DB and base64 FEED_ENCRYPTION_KEY. Preserve the database and encryption key when updating code. A different key cannot decrypt existing subscriptions; a different database does not contain existing accounts. Keep protected backups outside Git and release artifacts. See [deployment.md](deployment.md) and [auth-local.md](auth-local.md).

Accounts use independent application passwords. There is no self-service password reset, password-change page, account deletion interface or administration panel. The app does not verify TUM identity, collect school passwords or gain university API access merely through authentication. Keep future SAML disabled until institutional approval and a deliberate deployment change.

## Database migrations

Change db/schema.ts, then run npm run db:generate. Review and commit drizzle/*.sql, drizzle/meta/_journal.json and snapshots together. Preserve migration history; do not rewrite an applied initial migration to represent a later schema. Native Sites deployment collects root drizzle/ for its migration pipeline.

Never put CREATE TABLE in request handlers or replace persistent accounts with an in-memory map. Use prepared bound SQL and include the authenticated user ID in all account-data reads and writes.

Subscription URLs are bearer secrets. Only ciphertext belongs in feeds.encrypted_url. User-facing responses contain normalized events and connection state, not original URLs, ciphertext or raw query tokens. Keep errors generic. Preserve the stale-refresh condition against the prior encrypted URL so a late request cannot overwrite a re-bound feed or restore a removed one.

## Privacy and caching

public/data.js remains intentionally empty: no legacy personal course records or Moodle task snapshot. Each account starts empty and receives only its owner's bound calendars. Never populate a shared static file from a user's live account. Do not commit credentials, raw subscriptions, database copies, private calendar exports, session tokens, source PDFs or private imports.

The account edition does not enable the legacy service worker. Account HTML and APIs must remain private, no-store, with authorization enforced before data is returned. Do not promise offline private data or cross-device synchronization of archived NLP progress. npm run build:static and GitHub Pages provide only a login introduction, without a working authentication backend.

## Archived NLP source

The bilingual practice material remains separately maintained source. It is not in the current Worker UI allowlist and is not connected to account progress. The editable bank is authoring/in2361/content.json. Preserve its 91 question IDs and update both languages, answers, provenance, source qualifications and excerpts together.

npm run nlp:rebuild rebuilds public/courses/in2361/data.js with the Node/KaTeX renderer and checks IDs and evidence images. It does not deploy, fetch Moodle, reset progress or implement account synchronization. Review an expanded answer and its source accordion if releasing this material separately.

Preserve backup identity for existing standalone installations: format nlp-study-backup, version 1, course IN2361, storage key nlp-study-in2361-v1. Cross-origin transfers use that standalone app's implemented export/import controls; never commit learning-record exports.

The advanced bilingual/ tools and apply_bilingual.py require original material supplied through NLP_LECTURES_DIR; original PDFs and historical baselines are not included. Python batch updates can overwrite manual edits and need their documented dependencies. Use repository content tests for ordinary maintenance. Add evidence only from accessible, accurately cited material.

A new course needs independent stable question IDs, authoring source and backup identity. Add its deployed route only after implementing and reviewing access and progress behavior. A new link does not imply automatic Moodle content or assessment synchronization.

