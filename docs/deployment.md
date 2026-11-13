# Deployment boundaries

## Optional empty static client preview

Run `npm ci`, `npm test`, `npm run check` and `npm run build`. The generated `dist/` directory contains only the login introduction, authentication UI, icons and manifest. Account/timetable pages, NLP content, service workers and backend code are excluded. Do not upload `server/`, `.env`, signing keys, session files or private account imports to a static publishing directory.

`.github/workflows/pages-demo.yml` is an optional, manual workflow. It requires an explicit static-preview confirmation on each dispatch. A repository maintainer must separately choose GitHub Actions as the Pages source and configure any deployment environment. The workflow does not enable Pages automatically, hardcode a repository owner or deploy an authentication server.

The workflow follows the official [setup-node](https://github.com/actions/setup-node), [Pages artifact](https://github.com/actions/upload-pages-artifact) and [Pages deployment](https://github.com/actions/deploy-pages) actions. The normal CI workflow has read-only repository permissions and does not publish.

## Authentication deployment

GitHub Pages cannot execute the Node authentication backend. Deploy the configured backend to a server-capable host and serve the browser app from the same trusted origin where practical. TUM SSO is unavailable until the school/identity provider has approved the service registration and the backend has matching endpoints, certificates and session configuration. Use the separate authentication documentation for its implementation and required environment values; never infer approval from a working login page.

SSO identifies a user. It does not by itself authorize reading that person's TUMonline or Moodle records. Any future account import must use an approved data-access mechanism with its own authorization. A fixed demo file must never become the default personal timetable for every account.

## Storage and cache boundary

No service worker is deployed by the new login edition. The legacy private-edition PWA generator remains archived and disabled. API routes, login callbacks, tokens, account pages, account-specific timetable responses and grades must not enter public caches. Send non-cacheable headers from the backend; do not rely on browser code to protect server data. The private server data directory and credentials are ignored by this repository, but deployment secrets must still be supplied by the host, not committed.

Changing the hosting origin creates a separate browser-storage space. Keep the existing learning-bank IDs and use the authenticated NLP backup/import controls to transfer progress. This login edition does not promise offline access to private university pages or personal account data.
