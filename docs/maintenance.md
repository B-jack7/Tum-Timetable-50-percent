# Maintenance

## Empty public client and account data

`public/data.js` is intentionally empty: zero course records and no Moodle task snapshot. It must not contain the legacy personal timetable or act as an import shared by every account. Repository checks enforce that empty initial state. Keep live account records, grades, sessions, OAuth/SAML messages, refresh tokens and private import files outside `public/` and source control. Never add authenticated responses to the PWA release asset list.

Edit browser source files in `public/`. The Node backend determines which authenticated pages are served. `npm run build` creates only a static login introduction: `index.html`, `login.html`, `auth.js`, `auth.css`, icons and the manifest. It never copies account pages, timetable data, the NLP bank or a service worker. `npm run dev` previews this restricted artifact rather than serving all source files without authentication.

The private-edition PWA generator is archived at `scripts/legacy/prepare-pwa-release.mjs`. No default script invokes it. Do not re-enable it over the login application: precaching account pages or responses would cross the authentication boundary. This version does not promise offline access to personal data.

## NLP source

The editable bank is `authoring/in2361/content.json`. Keep the 91 existing IDs and maintain these fields together:

- `question` and `questionZh`: the English question and Chinese translation.
- `answer` and `answerEn`: Chinese and English explanations, including formula source.
- `sourceEvidence`, `sourceReview`, `auditNoteEn/Zh`, `sourceExcerptEn/Zh`: provenance, qualifications and source wording.

Run `npm run nlp:rebuild`. The bundled Node/KaTeX renderer produces both languages and commentary HTML, validates stable IDs and evidence images, then replaces `public/courses/in2361/data.js`. It does not reset local learning progress, fetch Moodle, or deploy the site. Preview an expanded answer and its source accordion after an edit.

Keep backup compatibility: format `nlp-study-backup`, version `1`, course `IN2361`, storage key `nlp-study-in2361-v1`. To move progress to a new origin, export a backup from the original app and import it through the NLP resources page. Do not commit the exported JSON.

## Advanced upstream tools

The complete `bilingual/` tools, `apply_bilingual.py`, audit JSON and KaTeX license are retained for maintainers. Normal edits need only the JSON bank and Node renderer. Running the Python batch updater can overwrite manual edits and requires `pypdfium2` plus original source materials supplied through `NLP_LECTURES_DIR` (default: an untracked `private-materials/` directory). It is not a portable, no-input rebuild command.

`bilingual/verify.py` also expects an external historical baseline and original PDFs, which are not included. Use the repository's content tests for this migration instead. New evidence pages must be generated from materials the maintainer can access, placed in `public/courses/in2361/sources/evidence/`, and cited accurately. Do not recreate missing answers from guesses. Complete original PDFs are excluded from this repository.

## Add another course

Use `public/courses/<course-id>/` plus a separate authoring directory. Define its own stable question IDs, browser storage key and backup identity. Add a course link only when it is actually implemented; do not relabel the NLP bank as another course. Source acquisition and review remain explicit steps, not an automatic Moodle synchronization claim.
