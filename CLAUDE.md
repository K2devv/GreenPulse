# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

GreenPulse is a responsive environmental reporting and response-coordination app for District 5, Quezon City. Production: https://greenpulse-district5.vercel.app

- **Frontend:** React 19 + Vite 6 + TypeScript (strict) SPA, MapLibre GL maps (`maplibre-gl` through `@vis.gl/react-maplibre`, clustering with `supercluster`), `lucide-react` icons, plain CSS. Installable PWA.
- **Backend:** Supabase (Postgres, Auth, private Storage, Realtime) plus Vercel edge functions in `api/`.
- **README.md** covers operator setup, environment variables, deployment, backups, and the role matrix. Read it when you need operational detail; don't duplicate it here.

## Commands

```sh
npm run dev                 # Vite dev server (also mounts most api/ handlers, see below)
npm run build               # tsc -b && vite build. The type check is the build gate; there is no lint script.
npm test                    # Vitest (forks pool), runs only src/**/*.test.ts(x)
npx vitest run src/lib/report-filters.test.ts   # one test file
npx vitest run -t "test name"                    # tests matching a name
npm run test:e2e            # Playwright (uses the Edge channel: channel 'msedge')
npm run test:storage-recovery   # storage backup/restore test, non-production service-role key only
```

- **E2E:** when `E2E_BASE_URL` is unset, Playwright starts `e2e/start-demo.mjs`, which runs Vite on `127.0.0.1:4173` with the Supabase vars blanked, so the tests run in demo mode. `e2e/roles.spec.ts` is skipped unless the `E2E_*` account variables are set (see README). Never point role tests at production.
- **CI** (`.github/workflows/quality.yml`): Node 22, `npm ci`, `npm test`, `npm run build`.
- **Ops scripts** in `scripts/`: `storage-backup.mjs`, `storage-restore.mjs` (does a dry run unless `CONFIRM_STORAGE_RESTORE` is set), `import-district5-boundaries.mjs`, `fetch-district5-osm-boundaries.mjs` (regenerates the bundled barangay outlines in `src/data/`, which cut the maps down to District 5 and autofill the report form's barangay), `build-photo-issue-labels.mjs` (regenerates the photo suggestion label vectors). README has usage.

## Demo mode vs. Supabase mode

`src/lib/supabase.ts` exports `isSupabaseConfigured` and a `supabase` client that is `null` when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing. Without them the app runs in **demo mode**: there is no auth, the seed `initialReports` are shown, and new reports persist to `localStorage['greenpulse-reports']`.

- Guard every Supabase call on `supabase` / `isSupabaseConfigured`.
- Keep demo mode working. The local e2e suite depends on it.

## Frontend architecture

- **`src/App.tsx`** (~2.4k lines) is the single stateful root. It handles auth and session, report loading, the Realtime channel `greenpulse-report-updates` with a periodic refresh fallback, the staff queue (`staff_report_page` RPC, `STAFF_PAGE_SIZE = 50`), admin RPCs (`admin_pilot_outcomes`, `admin_notification_delivery_history`), the report form, the map, and modals.
- **Report loading:** reports load a page at a time (`lib/report-paging.ts`, `REPORT_PAGE_SIZE` rows per request, at most `REPORT_LOAD_LIMIT` kept). A full sync pages through everything; Realtime events and the one-minute fallback do a light refresh that re-reads only the newest page plus the reports Realtime named, and merges them into the rows already held. Call `setReportRefreshToken` for a full sync and `requestLightRefresh` for a light one.
- **Notifications:** `useNotificationInbox` owns the signed-in user's inbox: it filters to `recipient_id` (admins can read every row, but the inbox is personal), subscribes to Realtime, and gets the unread count from the server so it is not capped by the loaded page. Supabase queries only run when awaited or `.then()` is called; `void query` sends nothing.
- **Dialogs:** give a modal `role="dialog"` and `aria-modal="true"`. `useDialogFocusTrap` (installed once in App) then keeps Tab inside the topmost one.
- **Data mapping:** `Report` in App.tsx is the camelCase view model. Database rows (`ReportRow`, snake_case) are converted with `toReport()` in `src/lib/supabase.ts`. When you add a column, update `ReportRow`, `toReport()`, and `Report`.
- **Extracted UI components** sit next to App.tsx: `HeroPanel` (the green opening panel with the headline, main action and stat tiles), `StaffWorkflowPanel`, `ReportCommunication` (timeline and conversation), `GuestReportTracking`, `AdminCharts`, `CommandPalette`, `EnvironmentalReports`, `Toaster`, `ViewLoader`, and others.
- **Layout breakpoints:** the hero stacks below 1120px, the map and report list stack below 900px, phones (760px and below) get the floating Report button, and at 640px and below every `.report-modal` opens as a bottom sheet. The desktop app's window can shrink to 980px, so check that width too.
- **`src/lib/`** holds pure, unit-tested logic. Put new business logic here with a colocated `*.test.ts`, not inline in App.tsx.
  - `report-workflow.ts`: status sets (`ASSIGNABLE_STATUSES`, `VERIFICATION_STATUSES`, `isOpenStatus`) and the `build*Update` / `buildResolutionReview` functions. These return `{ payload }` (a Supabase update object) or `{ error }` (a user-facing message).
  - `report-filters.ts`: staff queue filters, `DISTRICT_5_BARANGAYS`, `detectBarangay`, `formatReportId`, and saved filters per user.
  - `report-summary`, `report-analytics`, `report-response-times`, `report-deadline`, `report-recurrence`, `report-timeline`, `report-export`: dashboard metrics, summaries, CSV and print export, and hotspot detection.
  - `report-drafts.ts`: the IndexedDB offline drafts and upload queue. `report-photos.ts`: in-browser compression and photo limits.
  - `i18n.ts`: English and Filipino. Wrap every piece of visible text in `t('English text')` (values go in `{name}` placeholders; use `tn()` when a count changes the English wording), and add the Filipino to `i18n-fil.ts`, which `i18n.test.ts` checks. Database values such as status, category and urgency stay English in code and storage and are passed through `t()` only where they are shown; give a `<select>` option an explicit English `value`. Text the database writes (notifications, timeline entries) is translated by `server-text.ts`. The Filipino dictionary loads only when chosen (`greenpulse-language`, header toggle), and `main.tsx` waits for it before the first render. Modules the `api/` handlers import (`report-filters`, `report-timeline`, `guest-tracking`, `barangay-lookup`, `phone-number`) must not import `i18n.ts`; translate their output where it is shown. Emails and CSV/print exports stay in English.
  - `ui-copy.ts`: `translate()` for a few shared strings, through `t()`.
- **Maps:** two lazily loaded components, `ReportMap` (incident map) and `LocationPickerMap` (report form), share `MapParts.tsx` (pins, cluster bubble, zoom buttons, the district camera lock). App.tsx passes them plain props and keeps the search box, legend, and mobile sheet.
  - **Keep the map library lazy.** Only `map-engine.ts` imports `maplibre-gl` at runtime (it also sets the worker URL, which maplibre-gl 6 needs under Vite). Don't import it from App.tsx or add it to `manualChunks`, or it joins the first load.
  - **The style is code.** `lib/map-style.ts` builds the whole MapLibre style: a basemap over OpenFreeMap's vector tiles (free, no key) in the app's palette, then the district mask, outline, barangay labels, density circles, and GPS circle. Light and dark share layer ids. If OpenFreeMap is unreachable the components switch to an OpenStreetMap raster basemap. A unit test validates the style against the MapLibre style spec.
  - **District 5 only.** `lib/district-outline.ts` merges the barangay outlines into the district's outer edge. Database polygons are used when all 14 are imported and fit together; otherwise the bundled outlines, then the bounding box. `lib/map-viewport.ts` turns that outline into the map's minimum zoom and pan limit: at the lowest zoom the whole district fits as large as it can (`districtLockCamera`, a 10 px margin), and panning stops at the district's bounds, so the map cannot be zoomed out or dragged away past District 5.
  - **Pins** are DOM markers (`<button>`s), so they are styled in `styles.css` (`.map-pin`, `.report-cluster`). `lib/map-clusters.ts` groups them and fans out reports that share one rounded public coordinate.
- **CSS:** a single `src/styles.css`, imported in `main.tsx`. There is no CSS framework.
  - **Tokens** sit in one `:root` block at the top, with dark values in the `.theme-dark` block right after it. Use them instead of literal values: colors (`--text*`, `--accent*`, `--surface*`, `--border*`, status `--danger*`/`--warn*`/`--info*`), type (`--fs-2xs` to `--fs-4xl`, `--fs-display`), radius (`--radius-xs` to `--radius-pill`), spacing, and shadows. A color token that flips in dark mode needs no `.theme-dark` override.
  - **Motion:** use `--dur-fast`, `--dur-med`, or `--dur-slow` with `--ease-out` (or `--ease-spring` for emphasis). Only loops, spinners, and the few choreographed sequences over a second keep their own timing. Every animation must still work with motion reduced: the OS setting and the in-app `html[data-motion="reduced"]` switch both cut animations to their end frame, so an animation that ends invisible needs `animation: none` there.
  - **Focus:** one global `:focus-visible` ring uses `--focus-outline`. Don't remove outlines; an input inside a wrapper (`.search-box`, `.select-wrap`, `.map-search-box`, `.location-autocomplete`) gets the ring on the wrapper instead.
  - **Theme:** `src/lib/theme-preference.ts` follows the OS color scheme until the user toggles; only the explicit choice is stored (`greenpulse-theme-choice`). The boot splash script in `index.html` mirrors that logic.
- **Photo reporting:** a new report opens on `ReportStart` (lazy loaded): report with a photo (live camera scan in `CameraScan`, or upload) or fill in the form. A photo that shows an issue opens the form filled in (category, issue type, title); one that doesn't shows "No issue found" and Try again returns to the start. A restored draft skips the start screen, and so do browsers that can't run the checker (`photoCheckerSupported`: no WebAssembly SIMD or module workers, so before Chrome 91 or Safari 16.4). Photos added inside the form also get a suggestion (`usePhotoIssueSuggestion`, `PhotoIssueSuggestion`). Everything is read on the device (no server, no API key).
  - A failed check carries its cause (`lib/photo-check-failure.ts`): `download` (model download failed: Try again), `app` (GreenPulse's own files didn't load, as after a deploy while the page was open: Reload page), `device` (the model couldn't run here: Fill in the form), or `photo` (unreadable photo: back to the start). The worker posts `ready` once its script has loaded, so a worker error before that is `app` and after it is `device`. The real reason is logged with `console.warn`. Keep the causes separate; one message for all of them sent reporters to check their connection when that wasn't the problem.
  - `usePhotoChecker` owns the one Web Worker, shared by the start screen and the form so the model loads once. `photo-issue.worker.ts` runs CLIP's image half with `onnxruntime-web` and matches it against the label vectors in `src/data/photo-issue-labels.json`; scoring and preprocessing are in `lib/photo-issue-classifier.ts`, and when a live scan stops is in `lib/photo-scan.ts`.
  - The 64 MB model is fetched from Hugging Face at a pinned revision, checked against its SHA-256, and kept in Cache Storage. The start screen notes the download; inside the form, phones on mobile data are asked first. Only the worker imports `onnxruntime-web`, so keep it out of App.tsx. After editing a label's prompts, rerun `scripts/build-photo-issue-labels.mjs` (see its header). E2E tests block `huggingface.co` so they never download the model; `e2e/camera-scan.spec.ts` uses Chrome's fake camera.
- **PWA:** `public/service-worker.js` is registered only in production builds. Bump `CACHE_NAME` (`greenpulse-shell-vN`) when you change what the shell caches.
- **Browser storage:** keys are prefixed `greenpulse-`. Wrap access in try/catch, as the existing code does.

## Server API (`api/*.ts`)

Each file is a Vercel edge function with the same shape:

- `export const config = { runtime: 'edge' }`
- a default export `handler(request: Request): Promise<Response>`
- a local `jsonResponse()` helper that sets `Cache-Control: no-store`
- `declare const process` for env access

Handlers follow one pattern:

1. Validate the input.
2. Return 503 if the required env vars are missing.
3. Verify the caller with an anon-key client plus the bearer token (`auth.getUser`), and check their role where needed.
4. Do privileged work with a service-role client.

| Endpoint | Purpose |
| --- | --- |
| `admin-create-responder` | Admin invites a responder by email |
| `guest-reports` | Guest submission and tracking: honeypot, minimum form time, IP-hash rate limit via the `claim_guest_report_slot` RPC, tracking code from `GUEST_TRACKING_SECRET` |
| `confirm-report` | "Still there" confirmation from a signed-in user or a guest |
| `send-notification-emails` | Delivers notification emails through Resend |
| `process-escalations` | Deadline and SLA escalations; daily cron in `vercel.json`, authorized by `CRON_SECRET` |

**Local dev:** `vite.config.ts` mounts these handlers as dev middleware. It copies only a fixed list of env vars into `process.env`: the Supabase URL and keys, `VITE_APP_URL`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `GUEST_TRACKING_SECRET`, and `CRON_SECRET`. If you add an endpoint, also add it to the handler map there. Use `npx vercel dev` for anything not mounted.

Server-only secrets must never get a `VITE_` prefix, because Vite ships `VITE_*` variables to the browser.

## Database (`supabase/migrations/`)

- **Applying migrations:** files are named with a timestamp (`YYYYMMDDNNNN_description.sql`) and applied manually, in filename order, in the Supabase SQL editor. The repo has no Supabase CLI config. Add changes as new migration files and don't edit migrations that have already been applied. Use `create or replace function` when you redefine a function.
- **Authorization is enforced in the database, not the UI.** RLS policies, `is_staff()`, `is_admin()`, and the `enforce_report_workflow` trigger control who can change which fields and statuses. Hiding a control in the UI is not authorization, so a change to a workflow or permission rule needs a migration.
- **Timeline:** `record_report_event` writes the `report_events` timeline. Notifications come from `create_report_notifications` and the other notification triggers.
- **Responder notifications** are limited to reports assigned to the responder, directly or through their team (`202611220002_responder_notifications_assigned_only.sql`): a `before insert` trigger on `notifications` drops any other notification addressed to a responder, and the read policy hides earlier ones once a report is reassigned. This covers every notification source, including ones added later, so don't work around it in a trigger.
- **Privacy rules to preserve:**
  - Public map coordinates are rounded and place labels are generalized (see `202610290001_public_location_privacy.sql`).
  - Reporter names stay hidden until a report is verified.
  - The `report-photos` bucket is private. Each report has `photo_visibility` (`private` by default, or `public`), chosen by a signed-in reporter in the form; guest photos are always private. Private photos are seen only by staff and the reporter. Public ones are seen by anyone, but only once the report is verified (`report_photos_are_public` in `202611220001_report_photo_visibility.sql`, mirrored by `PUBLIC_PHOTO_STATUSES` in `lib/report-photo-access.ts`); only then does `community_reports` carry the photo paths and a storage policy let anon sign them. After submission only an admin can change it, and only to `private`. Map previews fetch signed links when they open. A public photo needs consent notice `2026-11-v3`.
  - Guest contact emails live in a server-only table.
  - Rejected reports stay private.
- **Geofence:** `202610290004_district5_boundary_geofence.sql` is tested by `supabase/tests/district5_boundary_geofence.sql`. Reports outside District 5 are refused in three places: the form (`isReportableLocation` in App.tsx, at every way of choosing a location and again at submit), the guest endpoint (bundled outlines when the database has none), and the database trigger. The trigger only enforces once `district5_barangay_boundaries` has rows; `202611120001_district5_osm_boundaries.sql` loads the bundled outlines for that.

## Domain notes

- **Roles** are `resident`, `responder`, and `admin` (`Profile['role']`). Guests can submit reports without an account.
  - Only admins verify, reject, or mark reports as duplicates; assign work; and review resolutions.
  - Responders update only tasks assigned to them directly or through their team.
- **Status flow:** Submitted / Under review → Verified (or Rejected, Duplicate, or Additional information requested) → In progress → Awaiting verification → Resolved / Closed. A resolution review can send the report back to In progress.
- **Duplicated string unions.** The status, category, and urgency values are defined separately in `src/App.tsx`, `src/lib/supabase.ts`, `api/guest-reports.ts`, and the SQL constraints and triggers. Change them everywhere together.
  - The intake form offers only four categories (`intakeCategories`: Waste, Pollution, Flooding, Drainage). The full union also includes Water pollution and Air pollution.
- **Guest limits:** guest photos are capped at 2.5 MB each, compared with 5 MB for signed-in users, with at most 5 photos per report.
