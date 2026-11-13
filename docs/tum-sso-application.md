# Tum Timetable — SAML integration application draft

This draft records the materials needed for an LRZ review. It is not a submitted request or confirmation of eligibility. Tum Timetable is an independent project; adding its source to GitHub does not register a TUM service provider.

## Intended service

- **English name:** Tum Timetable
- **German name:** Tum Timetable — persönlicher Studienplan
- **English description:** An independent study companion for viewing a personal timetable and course study resources. TUM authentication identifies the visitor; access to TUMonline or Moodle data requires a separate approved integration.
- **German description:** Unabhängige Lernhilfe zur Anzeige eines persönlichen Studienplans und von Lernmaterialien. Die TUM-Anmeldung bestätigt die Identität; der Zugriff auf TUMonline- oder Moodle-Daten erfordert eine gesondert freigegebene Anbindung.
- **Intended audience:** Active TUM students. Confirm whether other active TUM accounts should be admitted; do not infer student status from an email suffix.

## Required information still to be supplied

| Field | Current status |
| --- | --- |
| Responsible operating institution and approval for a student-run service | Not confirmed; request eligibility review |
| Production HTTPS origin and authentication backend host | To be selected |
| SP EntityID, metadata URL, ACS and SLO bindings/URLs | Generated from the production backend configuration |
| SP signing/encryption certificate and private-key custody/rotation owner | Not configured; never commit private keys |
| Technical administrator name and email | To be supplied |
| User support name, email and helpdesk URL | To be supplied |
| Security contact name and email | To be supplied |
| Institution/company information page in German and English | To be supplied |
| Service privacy notice in German and English | Draft below; requires operator review |
| Service logo | Optional transparent logo, following LRZ size requirements |
| User population and requested attributes | Minimal stable opaque subject identifier; exact attribute must be approved by LRZ |
| Relevant processing-activity register entry and processing grounds | Operator must confirm the applicable LRZ requirement |
| TUMonline/Moodle API access, data scopes and authorization model | Not connected or approved |

LRZ's guide requires either the specified institution-hosted, pseudonymous-login arrangement or an approved list of requested personal attributes together with the stated processing-activity registration confirmation. Do not claim that this project already meets either route. The guide does not establish a universal `*.tum.de` hostname requirement or guarantee that a personal GitHub Pages project qualifies.

## Submission route — for a future operator action

1. Confirm the operator and hosting eligibility with the LRZ Servicedesk under **Benutzerverwaltung und Authentisierung**.
2. Deploy the HTTPS SAML backend, publish its SP metadata, and assemble the fields above. The application currently exposes configuration status separately from authentication; unconfigured deployments must stay unavailable.
3. Provide the reviewed service description, privacy notices, contacts, metadata and requested attributes to LRZ. No request has been sent from this project.
4. Wait for registration and attribute-release confirmation. Use the approved federation metadata and validate SAML signatures, issuer, audience, recipient and request correlation through the maintained SAML implementation.
5. Verify the account callback and local logout in the deployed environment. The account page must never collect a TUM password.
6. Obtain separate authorization for personal course/Moodle access before connecting data. Until then, show the empty personal timetable.

## Privacy notice outline — incomplete draft

- **Controller and contact:** [operator's legal identity, address, privacy contact — required before launch].
- **Purpose:** Establish a TUM-verified account session and, only after separate data integration, show that visitor's personal courses.
- **Login flow:** Credentials are entered on TUM's official login page. Tum Timetable does not provide a password field or receive the user's TUM password.
- **Account identifier:** The backend uses an opaque application-specific identifier. The account page does not display the original TUM identifier and does not persist account identifiers or session tokens in browser storage.
- **Current course data:** Personal timetable import/sync is not connected. This page does not load a public personal timetable, guest NLP progress or another visitor's course data.
- **Session:** Authentication uses a server-managed session cookie. Document its exact name, flags, lifetime, renewal and retention policy from the deployed backend before publishing the notice.
- **Progress:** The account page does not provide cross-device quiz-progress sync. Guest practice storage is separate.
- **Logout:** Local sign-out ends the Tum Timetable session only; it does not log the user out of TUMonline, Moodle or the university identity provider.
- **Recipients, hosting location, retention, legal basis and user rights:** [operator must fill from actual deployment; not yet determined].

## Official references

- [LRZ: Shibboleth für eigene Webanwendungen](https://doku.lrz.de/shibboleth-fuer-eigene-webanwendungen-10333379.html) — registration, metadata, contacts and data-protection requirements.
- [LRZ: Shibboleth und DFN-AAI](https://doku.lrz.de/shibboleth-und-dfn-aai-10615328.html) — identity and service-provider roles; login takes place at the home institution.
- [TUM: Institutional Login / Shibboleth](https://ub.tum.de/en/shibboleth) — TUM credentials remain at the university.
- [TUMonline: transition to Public REST APIs](https://www.typo3.tum.de/en/t3/anleitung/extensions/news/default-layout/article/umstellung-von-tumonline-auf-public-apis/) — API modernization, not automatic authorization for this application.

OIDC is not assumed: no client ID, issuer, client secret or self-service registration has been approved for this project. An identity assertion is not a course-data API token.
