# GreenPulse

Responsive environmental reporting and response coordination for District 5, Quezon City.
Production: https://greenpulse-district5.vercel.app

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install` and `npm run dev`.
3. Without Supabase environment variables, the app runs in demo mode. Reports in demo mode are local to this browser and are not shared.

The Vite dev server includes server-side adapters for responder invitations, guest reports and tracking, report confirmations, notification emails, and photo classification. Add `SUPABASE_SERVICE_ROLE_KEY`, a stable `GUEST_TRACKING_SECRET` of at least 32 characters, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, and `GEMINI_API_KEY` to `.env.local` without a `VITE_` prefix to use these features locally. Guest reporting refuses to start when the tracking secret is missing; it never falls back to the service-role key. Other Vercel API routes can be tested with `npx vercel dev` after linking the project.

## Connect Supabase

1. Create a Supabase project and copy its project URL and publishable/anon key.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL`.
3. In the Supabase SQL Editor, run the migration files in `supabase/migrations/` in filename order. For an existing project, also apply `202610010001_admin_responder_provisioning.sql` before creating responders.
4. In Authentication settings, enable email/password and phone sign-in. Configure email confirmation and an SMS provider for phone OTP; the app offers both verification choices during signup.
5. Sign up using your own account. Promote the first administrator from the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

6. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable. Once the first admin is promoted, admins can create responder profiles from **Staff desk → Add responder**; the responder receives a Supabase invitation email to finish account setup. For bootstrap access before that endpoint is configured, an administrator can still promote an account using SQL. Never expose the service-role key in the browser or commit it to `.env.local`.
7. Restart the Vite server after changing environment variables.

Residents can submit reports while signed in or as guests. Guest reports use a private, high-entropy tracking code derived by the server from a random submission identifier; the database stores only its hash, and a guest must provide an email address or phone number, kept in a server-only table. Guests can view report history and confirm whether a resolution worked by entering that code. A server endpoint applies a honeypot check, minimum form time, District 5 field validation, and per-IP rate limits before saving a guest report. Guest photo uploads are limited to 2.5 MB and remain in the private photo bucket. Signed-in residents can view their own pending report history. Submitted and under-review reports appear on the public map so they are shared across devices; rejected reports remain private. Reporter names are hidden until a report is verified, and photo paths are never exposed through the public map. Responders and administrators can review all reports, including photos and location. Only administrators verify reports (validate, reject, mark as duplicate, request more information, and correct category or urgency, with verification notes and a recorded verifier and timestamp), assign verified reports to a responder and/or team with a priority, due date and instructions, and review resolutions. Responders update only the tasks assigned to them (directly or through a team): they start work and submit a resolution with response notes and after-photos, which an administrator then approves, rejects, sends back for additional action, or closes. These rules are enforced by a database trigger, not just the interface. Admin-created responder accounts are invited by email and assigned the responder role server-side; other role changes remain in the Supabase SQL Editor. Users cannot promote themselves.

Administrators can open the staff view for a live dashboard of total, pending, verified, assigned, in-progress, resolved, closed, rejected, and high-urgency reports, plus this-week and this-month intake. The dashboard charts reports by category, status, urgency, location, and day over the last 14 days; it also shows resolution rate, average response times, and responder/team workload. Admins can set standard and high-urgency overdue thresholds in **Response deadlines**. Report updates refresh through Supabase Realtime, with a 60-second refresh fallback and a visible last-sync time. Use **Response desk** to switch to the report workflow; queue search, filters, and 50-row pages run through a staff-only database function.

Reports record a District 5 barangay (selected on the report form and pre-filled when the chosen place name mentions one). Admins can create teams and choose their members from **Staff desk → Manage teams**; staff can then assign a report to a responder, a team, or both. Apply `supabase/migrations/202610140001_barangay_and_teams.sql` before using these features; until then, reports still submit without a barangay and team assignment stays hidden.

**Report communication, timeline, and summaries.** Apply `supabase/migrations/202610150001_report_communication.sql` to let admins, assigned responders, and reporters exchange comments, information requests, and replies (with up to 3 photos) on an existing report. Every report shows a chronological timeline, and admins can generate daily, weekly, monthly, or custom-range summaries (category, barangay, resolution, flood, waste, and pollution views) with descriptive trends, exported as CSV (opens in Excel) or PDF (via the browser print dialog).

**Public map discussions.** Apply `supabase/migrations/202611080001_community_report_comments.sql` to let signed-in residents read and post public comments from a map marker's discussion view. Public comments use the label “Community member” and remain separate from private report replies and staff messages; visitors can read comments without signing in.

**Guest access, nearby reports, resolution feedback, and recurring inspections.** Apply `supabase/migrations/202610200001_guest_feedback_recurrence.sql` and `supabase/migrations/202611080002_guest_contact_phone.sql` after the earlier migrations. Guests must provide an email address or phone number; Resend can email the guest tracking code when an email is provided. The report form suggests same-category open reports from the last 30 days within 350 metres. Signed-in residents can follow a report for status and assignment notifications; anyone can confirm that the issue is still present, which adds a timeline event and alerts staff. After a report is resolved, its reporter can confirm that it was fixed or ask for follow-up. Admins can reopen a still-persistent issue for responder action. Admins see recurring hotspots when at least three non-rejected, non-duplicate reports of the same category and barangay fall within 350 metres during the last 90 days. They can schedule an inspection task, assign a team and due date, then admins or the assigned team can mark it complete.

The staff desk queue has a search box and a filter panel. Search matches report ID, title, description, reporter, location, barangay, category, issue type, assigned responder and assigned team. Filters cover status, resolution stage, category, urgency, barangay, assigned responder, assigned team and submission date range. The server applies those filters and returns up to 50 reports at a time. The barangay list is in `src/lib/report-filters.ts`; confirm it with the participating barangays before a pilot.

The notification inbox is recipient-scoped and includes report submission, assignment, status, critical and unassigned report, and resolution-verification alerts. Overdue alerts use configurable standard and high-urgency deadlines, initially 48 and 12 hours. Email alerts are optional per account and delivered through Resend. Configure `RESEND_API_KEY` and a verified `NOTIFICATION_FROM_EMAIL` as server-only environment variables; in-app notifications work without them. The workflow includes `Additional information requested`, `Awaiting verification`, and `Closed` statuses.

Reports capture a category and specific issue type, urgency, observation date/time, description, optional additional information, barangay, and a selected map/GPS location. Residents may attach up to five JPEG/PNG/WebP photos (5 MB each for signed-in users; 2.5 MB each for guests). Images are compressed in the browser before upload. Photos use a private `report-photos` bucket and are readable only by their uploader or staff. Before submission, users must accept a visibility notice listing the fields that may appear on the public community map. The accepted notice version and server timestamp are stored with the report. Public coordinates are rounded to three decimal places and public place labels are generalized to the barangay or District 5; the community view does not expose additional information, email, or private photo paths. Reporters' display names may appear after verification, as disclosed in the notice. The database keeps reports and photos until the participating Quezon City office establishes a retention policy; automated deletion is not enabled. The database trigger records report submission, status transitions, assignment changes, and resolution-note edits in `report_events`.

The resident reporting flow is in English. The production web app is installable as a PWA and caches its app shell and same-origin static assets for offline viewing. Reporters can save drafts and queue report submissions locally for upload when connectivity returns; map tiles and Photon place search still require connectivity.

The provisional boundary source selected for the pilot is the [PSA Barangay Boundary layer on GeoRisk](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/layers), which describes its barangay boundaries as indicative observations from June 2016 and credits PSA. The layer's query service is currently unavailable, so its GeoJSON is not included yet. After obtaining `data/district-5-quezon-city.geojson`, apply `202610290004_district5_boundary_geofence.sql` and run `node scripts/import-district5-boundaries.mjs`. This validates all 14 expected barangays, imports their provisional polygons, makes the database derive the barangay from the report point, and rejects points outside loaded polygons. Until the import succeeds, the app still uses broad coordinate bounds and a selected barangay list; it does not prove a point lies inside District 5. Validate the indicative June 2016 layer with the participating Quezon City offices before the pilot.

Location suggestions use the Photon geocoding API, with the search centered near District 5; the user must select a suggested place or GPS location before submission. Map tiles and place data are attributed to OpenStreetMap contributors.

Photo category suggestions send a resized copy of a selected image to Google Gemini through the Vercel `/api/classify-photo` endpoint. Add `GEMINI_API_KEY` to the Vercel production environment; keep it server-side and never use a `VITE_` prefix. The endpoint also validates the signed-in Supabase session. Users are notified before analysis that the image is sent to Google.

Signup confirmations and responder invitations use `VITE_APP_URL`, falling back to the current site's origin when it is not set. Loopback URLs that do not match the current origin are ignored. Set `VITE_APP_URL` to `https://greenpulse-district5.vercel.app` in Vercel and configure Supabase **Authentication → URL Configuration** with this Site URL and these allowed redirect URLs. Previously sent invitation emails keep their original redirect, so resend the invite after correcting the URL:

- `https://greenpulse-district5.vercel.app/**`
- `http://localhost:5173/**`

Responder invitations do not assign a password. After accepting the link and signing in, responders can choose one under Profile settings → Sign-in password.

The Supabase built-in email sender is rate-limited. For pilot signups, configure a custom SMTP provider under Supabase Auth email settings. The app displays confirmation state and offers a resend action, but it cannot bypass Supabase delivery limits.

## Deployment and operations

- Run `npm test`, `npm run build`, and `npm run test:e2e`. Playwright runs resident intake and English-only interface checks against a local demo. Role and resolution checks are skipped unless `E2E_BASE_URL`, `E2E_RESIDENT_EMAIL`, `E2E_RESIDENT_PASSWORD`, `E2E_RESPONDER_EMAIL`, `E2E_RESPONDER_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, and `E2E_RESOLUTION_REPORT_TITLE` are configured. Point `E2E_BASE_URL` at a dedicated non-production project with resident, responder, and admin accounts plus an `Awaiting verification` fixture report. Do not run role checks against production.
- After applying the boundary migration, run `supabase/tests/district5_boundary_geofence.sql` in the test database to check polygon interiors, edges, holes, and MultiPolygon handling.
- The Vercel production deployment is `https://greenpulse-district5.vercel.app`.
- Set the two `VITE_SUPABASE_*` values in the hosting provider's environment settings. These are public client values; never put the Supabase service-role key in the frontend.
- Apply `supabase/migrations/202611050003_api_rate_limits.sql` and `supabase/migrations/202611080002_guest_contact_phone.sql` before deploying the guest tracking, contact, and photo-classification limits.
- Set `GUEST_TRACKING_SECRET` to a stable, server-only random secret of at least 32 characters. Guest tracking codes are derived from it, and the guest endpoint returns an error when it is missing or shorter. Keep it unchanged so queued guest submissions remain recoverable, and keep it separate from `SUPABASE_SERVICE_ROLE_KEY`. Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable for admin responder invitations. The endpoint verifies the signed-in user's database role before using this key.
- Set `RESEND_API_KEY` and a verified `NOTIFICATION_FROM_EMAIL` as server-only Vercel variables to enable notification email delivery. The endpoint validates the signed-in user and report access before sending, and respects each recipient's email preference.
- Set `CRON_SECRET` as a server-only Vercel variable to authorize scheduled deadline processing. The included daily Vercel cron is a backup. The `Deadline checks` workflow runs every 15 minutes once the `GREENPULSE_APP_URL` repository variable and `CRON_SECRET` repository secret are set, so a 12-hour high-urgency deadline is not left until the next midnight run. An administrator can also run a check from the staff dashboard. A second escalation is sent to admins after the configured multiplier of the initial deadline.
- Add `GEMINI_API_KEY` as a server-only Vercel environment variable for photo suggestions. Create a key at https://aistudio.google.com/apikey, then redeploy after adding it. Signed-in photo analysis is limited to 12 requests an hour and 40 a day per account.
- Configure the production site URL and allowed redirect URLs in Supabase Authentication settings, enable email confirmation and phone sign-in, configure an SMS provider for OTP delivery, and use HTTPS.
- Keep Supabase database backups/PITR enabled according to the project plan. Periodically test restoring a backup to a separate project. Export and retain migration files alongside source control; storage objects need a separate retention/backup plan because database backups do not contain their bytes.
- Back up private report photos separately with `node scripts/storage-backup.mjs <new-backup-folder>` after setting `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the process environment. Keep the backup encrypted and access-controlled. To recover, create an empty private bucket in the recovery project with the same name, set `REPORT_PHOTO_BUCKET` to that name, run `node scripts/storage-restore.mjs <backup-folder>` first for its integrity-checked dry run, then set `CONFIRM_STORAGE_RESTORE=RESTORE:<bucket-name>` and rerun. Restore never overwrites objects. Run `npm run test:storage-recovery` with a non-production service-role key to test a temporary `greenpulse-recovery-test-*` bucket; do not point that test at production photo data. Photos remain stored until the participating QC office sets a retention policy.
- Before a real pilot, validate the provisional PSA/GeoRisk boundary geometry and barangay assignments with the participating Quezon City office, set an approved retention period, review consent wording, configure the operational deadlines, and test every role with separate accounts. Until that retention policy is approved, GreenPulse keeps records and photos without automatic deletion.
- Queued offline reports and their photos are stored in this browser's IndexedDB until upload succeeds or the reporter deletes the draft. On reconnection the open app resumes submission using a stable idempotency key. Browser storage can still be cleared by the device owner, so this is a resilience aid rather than a guaranteed delivery channel.
- Deadline processing runs every 15 minutes through the `Deadline checks` GitHub workflow, with the daily Vercel cron as a backup for plans that only allow one schedule a day. The admin dashboard also provides a manual check. Email retry records include provider errors, attempt times and stable Resend idempotency keys. Pilot outcome summaries include response/resolution times and reopened reports by barangay.

## Role matrix

| Capability | Guest | Resident | Responder | Admin |
| --- | --- | --- | --- | --- |
| Submit a report | Yes | Yes | Yes | Yes |
| Track own report | Tracking code | Yes | Yes | Yes |
| View community map reports, including pending | Yes | Yes | Yes | Yes |
| Follow or confirm a nearby report | Confirm | Follow or confirm | Confirm | Confirm |
| Confirm a report resolution | Tracking code | Yes | No | No |
| View all pending report details in staff desk | No | No | Yes | Yes |
| Verify, reject, or mark reports as duplicate | No | No | No | Yes |
| Assign reports and inspection tasks | No | No | No | Yes |
| Complete assigned report or inspection work | No | No | Yes | Yes |
| Approve, reject, or close resolutions | No | No | No | Yes |
| Read private report photos | No | Own uploads | Yes | Yes |
| Create responder accounts | No | No | No | Yes, with email invitation |
| Change other account roles | No | No | No | SQL Editor only |

RLS policies in the migration enforce data access in the database; hiding controls in the UI is not treated as authorization.
