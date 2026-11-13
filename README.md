# Tum Timetable [50%]

Personal application accounts with private TUMonline and Moodle calendar subscriptions. New accounts start empty; the owner's private course records and links are not included in application data.

**App:** [Open Tum Timetable](https://tum-timetable.chenmooo010701.chatgpt.site)

## Get started

1. Register a **Tum Timetable application account** with an independent password. This is not TUM identity verification; never enter your school password here.
2. Open **账号与绑定 (Account and calendar binding)** in the page header. Bind your private calendar links: **TUMonline → Calendar → Publish**, and **Moodle → Calendar → Export calendar → Get calendar URL**. Moodle export availability and date ranges depend on your account.
3. Paste each URL once and select **绑定并同步 (Bind and sync)**. The timetable shows weekly times and locations; select a course for its available details. The **待办与截止 (Tasks and deadlines)** panel lists upcoming Moodle calendar activities and can expand to show more. Accounts only see their own feeds.

The desktop layout restores the original private edition's header, next-class card, statistics, weekly grid and tasks below the timetable. Switch to **全部课程 (All courses)** for course cards. On mobile, the bottom navigation is **课表 / 待办 / 课程 (Timetable / Tasks / Courses)**; account settings and binding remain in the header dialog. Only the layout and rendering tools are reused: live content comes from each account's own subscriptions.

Usernames are 3–32 ASCII letters/digits/dots/underscores/hyphens, starting with a letter or digit, and are normalized to lowercase. Application passwords are 8–128 Unicode characters and are not trimmed; uppercase letters and symbols are optional.

The app checks subscriptions on opening and every 15 minutes in the foreground; it checks stale data when returning to the foreground. **Closing it stops checks: there is no closed-app background polling.** Use **同步 (Sync)** in the header for an immediate refresh. The account-and-binding dialog shows the last successful sync and generic error state per source.

Private URLs are cleared from the input immediately, never written to browser storage or error messages, and encrypted by the account service. Possessing a subscription link grants calendar access; it is not direct school-account authorization.

The header's **导出 (Export)** downloads courses and Moodle activities as ICS; Moodle activities carry one-day and two-hour reminders. The tasks panel's **导入日历 (Import into calendar)** downloads only future activities with a stated time that you have not marked handled. Import the file into your calendar app; that app's notification settings control the reminders. Each downloaded file is a snapshot, so download it again after changes.

**已处理 (Handled)** is a browser-local personal mark, stored as opaque task IDs under the current account's scope. It does not change Moodle submission status and does not synchronize across browsers or devices. Calendar feeds do not supply verified assessment rules; course details explicitly say when assessment information is unavailable rather than filling it from the old private edition.

## Current application preview

<img src="docs/images/app-login.jpg" width="1200" alt="Desktop login page of the deployed Tum Timetable app">

<img src="docs/images/app-calendar.jpg" width="1200" alt="Restored original-style desktop timetable layout illustrated with fictional calendar events">

The calendar image is a **layout example with fictional data**, not a real user's timetable or a dataset supplied to new accounts. New accounts begin empty. Desktop keeps the weekly grid and tasks together; mobile uses **Timetable / Tasks / Courses**, with **Account and calendar binding** available from the header.

On Android, open the app in Chrome and choose **Install app** or **Add to Home screen**. The home-screen app follows website updates; personal calendar content is not cached for offline access. Only local handled-task ID marks are retained in this browser.

## Authorized private-edition preview

<img src="docs/images/timetable-preview.jpg" width="1200" alt="Owner-authorized full-page desktop screenshot of the private timetable edition">

Full-page desktop preview of the private edition, shown with the owner's permission. This authorized image is retained separately from the fictional current-layout example above. The account edition reuses the layout and starts with an empty timetable; the underlying private course records and subscription links are excluded. The existing private edition is maintained separately.

## Develop and verify

Use **Node.js 24 or newer**.

```sh
npm ci
npm start
```

The development server prints its HTTPS localhost URL, normally port 8781, uses a temporary local certificate, and stores development data in ignored `.local/`.

```sh
npm test
npm run check
npm run build
```

`build` bundles the APIs and an explicit browser-asset allowlist into `dist/server/index.js` for a Cloudflare-compatible Worker. That allowlist includes the login/account shells, restored timetable styles and renderer, task tools, calendar adapter, icons and manifest; it excludes personal snapshots and the archived NLP bank. Configure `APP_ORIGIN`, server secret `FEED_ENCRYPTION_KEY`, D1 binding `DB` and migrations as described in [application accounts](docs/auth-local.md) and [calendar binding](docs/calendar-binding.md). Never commit live secrets or databases.

GitHub Pages cannot run this backend. `npm run build:static` and the optional manual Pages workflow show only a login introduction, not a working account service. The private-edition PWA generator remains archived under `scripts/legacy/`; it is not enabled for account pages or private data.

## Scope and limitations

- Calendar events are **not grades, assessment rules, submission status or complete course materials**. External-platform deadlines may not appear.
- Successful synchronization does not prove that the source feed includes every course. Moodle export ranges can limit future coverage.
- The app uses its own accounts. School SAML remains a separate future option requiring university registration. `npm run auth:start` starts that optional integration, not the default app login.
- Reusing the course-detail layout does not connect a practice bank or fetch Moodle materials. The deployed account edition does not link the retained NLP bank. Its 91 stable bilingual IDs, backup format/key compatibility and editable authoring tools remain in the repository; standalone practice progress is not connected to application accounts. The existing private practice site is unchanged.

## Repository layout

```text
public/       Login/account UI, timetable renderer and adapter; no personal snapshot
server/       Accounts, sessions and calendar services
worker/       Worker entry and generated browser assets
db/,drizzle/  Database model and migrations
authoring/    Retained editable NLP source and math tools
scripts/      Build tools; archived legacy PWA helper
tests/        Front-end mock and compatibility tests
docs/         Setup, binding and maintenance notes
```

Complete original PDFs, school credentials, personal progress exports and private subscription URLs are excluded. Reusable course figures and KaTeX retain their attribution/license notices.

[中文使用说明](docs/usage.zh-CN.md) · [Account setup](docs/auth-local.md) · [Calendar details](docs/calendar-binding.md)
