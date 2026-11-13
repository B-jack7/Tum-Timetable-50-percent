# Personal calendar binding

The application account is independent of TUM. Users log in to TUMonline and Moodle themselves and copy a personal calendar subscription URL into their authenticated application account. This application never asks for university passwords or reuses a university browser session. Possession of a calendar link grants access to that calendar; it does not establish that its owner is the currently signed-in application user.

## Getting a link

- **TUMonline:** Calendar / Terminkalender → Publish / Veröffentlichen → copy the subscription URL. Export produces a snapshot file instead. The TUM student council's [current IT guide](https://mpic.fs.tum.de/en/studium/itguide/) confirms subscription support; [TUM IT's calendar guide](https://www.it.tum.de/fileadmin/w00bgh/www/pdf/SET_2022_Folien_TUMonline_EN.pdf) describes registered courses/exams and optionally bookmarked courses.
- **Moodle:** open the cross-course calendar → Export calendar / Kalender exportieren → choose all relevant events and the largest useful date range → Get URL address / Kalender-URL abfragen. Export downloads a snapshot. This is documented by [Moodle](https://docs.moodle.org/503/en/Using_Calendar); availability and labels on TUM's deployed Moodle must be checked by the user. Do not claim that every Moodle installation enables export.

The TUM ITO [computer-room documentation](https://wiki.ito.cit.tum.de/bin/view/CIT/ITO/Docs/Services/ComputerRooms/) contains official calendar links using the `/tumonlinej/ws/termin/ical` path. No real link query or token is copied into this repository. The module explicitly also accepts the known legacy calendar family `/tumonline/ws/termin/ical` and `/tumonline/ical.cal.ical`. A tokenless HTTP probe is not sufficient to determine whether a private subscription works. Unknown paths fail closed until verified and added deliberately.

## Module contract

`server/calendars.mjs` imports the official, exact-pinned `ical.js@2.2.1` ESM package. It uses Web APIs (`fetch`, streams, `AbortController`, `TextEncoder`, `TextDecoder`, `Intl`) without Node built-ins, filesystem access, global timezone registration or database access. [Upstream parsing](https://github.com/kewisch/ical.js/wiki/Parsing-iCalendar) and [recurrence/timezone guidance](https://github.com/kewisch/ical.js/wiki/Common-Use-Cases) describe the component/event API and the absence of a bundled IANA timezone database.

```js
import {
  validateCalendarUrl, fetchAndParseCalendar,
  parseCalendar, mergeCalendars, exportCalendar, CalendarError,
} from './calendars.mjs';

// source is exactly 'tumonline' or 'moodle'.
validateCalendarUrl(source, privateUrl); // { source, host }; never returns a token
const result = await fetchAndParseCalendar(source, privateUrl, { now: new Date() });
// result: { source, events, coverage: { start, end }, fetchedAt, warnings }
const combined = mergeCalendars(result, anotherResult);
const ics = exportCalendar(combined, { now: new Date(), reminders: true });
// parseCalendar(source, uploadedIcs, { now }) supports a snapshot without fetching.
```

Each normalized event contains:

```text
id             stable opaque 128-bit event identifier (not an auth primitive)
source         tumonline | moodle
title          plain text, at most 300 Unicode code points
location       plain text, at most 500 Unicode code points
description    plain text, at most 2000 Unicode code points
url            safe official HTTPS event link, or null
kind           class for TUMonline; deadline for the Moodle calendar group
allDay         boolean
start, end     UTC ISO strings, or YYYY-MM-DD for all-day events
occurrence     original recurrence time/date, including when an instance moves
```

All-day end dates are exclusive. Moodle's `kind` labels the source group for presentation; it does not prove that a manually created calendar event is an assignment, or that work is submitted. Raw source UIDs are not returned. IDs derive from source + UID + original recurrence occurrence (or a fixed single-event marker), so resyncing or moving an event preserves its ID. Deduplication does not remove similar events across different sources.

`CalendarError` has a stable generic `code` and a user-safe English `message`. Upstream exception text, response body and subscription URL are never included. `fetchImpl` and a shorter `timeoutMs` are injectable for tests; production calls should use defaults. `now` makes parsing/export deterministic in tests. Do not expose internal `feedUrl` parser options to clients.

## Retrieval and parsing limits

- Exact HTTPS allowlist: `campus.tum.de` with the three explicit TUM calendar paths; `moodle.tum.de` or `www.moodle.tum.de` with `/calendar/export_execute.php` only. No userinfo, explicit port, fragment, encoded path or arbitrary host. URL length ≤4096 characters; query ≤3072. Inputs are the original HTTPS link, not `webcal:` aliases.
- Anonymous GET, no authorization header or cookies, `cache: no-store`, `redirect: error`. Redirects are rejected even between official hosts; ask the user to copy the final official URL if their link redirects. No SSO redirects or automatic external-host following.
- Ten-second maximum for fetch plus body reading; ≤2 MiB after decompression. HTTP 200 plus an accepted calendar/binary MIME type and a complete VCALENDAR body are required. Login HTML, invalid UTF-8, missing MIME and oversized streams are rejected.
- Window starts at Monday 00:00 Europe/Berlin of the current week and ends 180 days after `now`. Upstream feeds may expose a shorter range; the returned window describes local processing, not proof of upstream completeness.
- ≤1500 source VEVENTs and ≤1500 expanded events per source; ≤10000 total iterator steps, 3000 explicit recurrence dates, 30000 lines, bounded nesting and property sizes. Excesses reject the source rather than silently presenting an incomplete calendar.
- UTC, all-day dates and embedded VTIMEZONE are supported. Europe/Berlin has a local per-calendar fallback for the supported modern timetable window. Floating times are explicitly treated as Europe/Berlin and produce a warning. Missing unknown zones reject the feed. The fallback follows current EU rules and must be maintained if legislation changes.
- Daily/weekly/monthly/yearly RRULEs with bounded common weekday/month-date patterns are supported; high-frequency or complex contracting combinations are rejected before the library expands them. EXDATE, RDATE, per-instance overrides, sequence updates, cancelled instances/series and THISANDFUTURE are handled. Period-valued RDATE, EXRULE and complex unsupported rules fail with a generic error. These guards matter because the pinned release does not contain every later upstream hardening change.

ICS export emits expanded occurrences with stable UIDs, UTC timed events, date-only all-day events, RFC text escaping, CRLF and UTF-8 folding at 75 octets. `reminders: true` adds two DISPLAY alarms, one day and two hours before each event; `reminders: 'deadlines'` adds those alarms only to Moodle-source events while retaining all classes in the export. Default is no alarms. Feed URLs and token-bearing URLs are stripped from display fields and are never exported as event links. Event URLs must use an official `tum.de` HTTPS host without embedded credentials, nondefault ports or secret-like query parameters.

## Storage and HTTP integration responsibilities

The caller must require an application session and CSRF protection for bind, refresh and delete operations. Store URLs encrypted with AES-GCM, bound to the authenticated user's ID and the source. Never put the plaintext URL into public assets, browser storage, query strings, analytics, error reports or logs. Store only normalized events in a per-user cache; respond with `Cache-Control: no-store` and never use a shared public cache for personal data.

On binding, validate and fetch first; only persist a successfully parsed source and the encrypted URL. On refresh, preserve the last known good events on failure, record a generic error and timestamp, and prevent an older in-flight refresh from overwriting a replacement binding. Feed removal must remove its encrypted URL and cached events. Add per-account refresh/binding rate limits outside this module. Treat `warnings` and an empty result honestly; an empty feed is not evidence that no classes or deadlines exist.

A subscription link can refresh changed events. An uploaded ICS file is a one-time snapshot. Calendar data cannot establish assessment method/weighting, submission status, grades, complete course materials or deadlines on external assignment platforms. [Moodle's official exporter](https://github.com/moodle/moodle/blob/main/public/calendar/export_execute.php) emits calendar event fields rather than those additional academic records. Do not claim direct TUMonline/Moodle account API authorization merely because the application account is logged in.

Run the isolated checks with `node --test server/calendars.test.mjs`. The complete fictional ICS fixture lives in that test file; it contains no user's old timetable, real private link or real token.
