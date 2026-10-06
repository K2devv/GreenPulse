# GreenPulse

Responsive environmental reporting and response coordination for District 5, Quezon City.
Production: https://greenpulse-district5.vercel.app

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install` and `npm run dev`.
3. Without Supabase environment variables, the app runs in demo mode. Reports in demo mode are local to this browser and are not shared.

The Vite dev server includes server-side adapters for responder invitations and notification emails. Add `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `NOTIFICATION_FROM_EMAIL` to `.env.local` without a `VITE_` prefix to test them locally. Other Vercel API routes can be tested with `npx vercel dev` after linking the project.

## Connect Supabase

1. Create a Supabase project and copy its project URL and publishable/anon key.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL`.
3. In the Supabase SQL Editor, run the migration files in `supabase/migrations/` in filename order. For an existing project, also apply `202610010001_admin_responder_provisioning.sql` before creating responders.
4. In Authentication settings, enable email/password sign-in and configure the email confirmation policy appropriate for the pilot.
5. Sign up using your own account. Promote the first administrator from the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

6. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable. Once the first admin is promoted, admins can create responder profiles from **Staff desk → Add responder**; the responder receives a Supabase invitation email to finish account setup. For bootstrap access before that endpoint is configured, an administrator can still promote an account using SQL. Never expose the service-role key in the browser or commit it to `.env.local`.
7. Restart the Vite server after changing environment variables.

Reports require a signed-in resident account. Submitted and under-review reports appear on the public map so they are shared across devices; rejected reports remain private. Reporter names are hidden until a report is verified, and photo paths are never exposed through the public map. Residents can view their own pending report history. Responders and administrators can review all reports, assign a responder, change status, and record resolution details. Admin-created responder accounts are invited by email and assigned the responder role server-side; other role changes remain in the Supabase SQL Editor. Users cannot promote themselves.

Administrators can open the staff view for a live dashboard of total, pending, verified, assigned, in-progress, resolved, closed, rejected, and high-urgency reports, plus this-week and this-month intake. The dashboard charts reports by category, status, urgency, location, and day over the last 14 days; it also shows resolution rate and average resolution time for reports with recorded resolution timestamps. Use **Response desk** to switch to the existing report workflow.

The notification inbox is recipient-scoped and includes report submission, assignment, status, critical and unassigned report, and resolution-verification alerts. Administrators also see open reports older than 48 hours as overdue tasks. Email alerts are optional per account and delivered through Resend. Configure `RESEND_API_KEY` and a verified `NOTIFICATION_FROM_EMAIL` as server-only environment variables; in-app notifications work without them. The workflow includes `Additional information requested`, `Awaiting verification`, and `Closed` statuses.

Reports capture a category and specific issue type, urgency, observation date/time, description, optional additional information, and a selected map/GPS location with an optional address description. Residents may attach up to five JPEG/PNG/WebP photos (5 MB each). Photos use a private `report-photos` bucket and are readable only by their uploader or staff. The database stores report coordinates and photo paths; the community view does not expose additional information or private photo paths. The database trigger records report submission, status transitions, assignment changes, and resolution-note edits in `report_events`.

Location suggestions use the Photon geocoding API, with the search centered near District 5; the user must select a suggested place or GPS location before submission. Map tiles and place data are attributed to OpenStreetMap contributors.

Photo category suggestions send a resized copy of a selected image to Google Gemini through the Vercel `/api/classify-photo` endpoint. Add `GEMINI_API_KEY` to the Vercel production environment; keep it server-side and never use a `VITE_` prefix. The endpoint also validates the signed-in Supabase session. Users are notified before analysis that the image is sent to Google.

Signup confirmations and responder invitations use `VITE_APP_URL`, falling back to the current site's origin when it is not set. Loopback URLs that do not match the current origin are ignored. Set `VITE_APP_URL` to `https://greenpulse-district5.vercel.app` in Vercel and configure Supabase **Authentication → URL Configuration** with this Site URL and these allowed redirect URLs. Previously sent invitation emails keep their original redirect, so resend the invite after correcting the URL:

- `https://greenpulse-district5.vercel.app/**`
- `http://localhost:5173/**`

Responder invitations do not assign a password. After accepting the link and signing in, responders can choose one under Profile settings → Sign-in password.

The Supabase built-in email sender is rate-limited. For pilot signups, configure a custom SMTP provider under Supabase Auth email settings. The app displays confirmation state and offers a resend action, but it cannot bypass Supabase delivery limits.

## Deployment and operations

- Run `npm test` and `npm run build`; the Vercel production deployment is `https://greenpulse-district5.vercel.app`.
- Set the two `VITE_SUPABASE_*` values in the hosting provider's environment settings. These are public client values; never put the Supabase service-role key in the frontend.
- Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable for admin responder invitations. The endpoint verifies the signed-in user's database role before using this key.
- Set `RESEND_API_KEY` and a verified `NOTIFICATION_FROM_EMAIL` as server-only Vercel variables to enable notification email delivery. The endpoint validates the signed-in user and report access before sending, and respects each recipient's email preference.
- Add `GEMINI_API_KEY` as a server-only Vercel environment variable for photo suggestions. Create a key at https://aistudio.google.com/apikey, then redeploy after adding it.
- Configure the production site URL and allowed redirect URLs in Supabase Authentication settings, enable email confirmation, and use HTTPS.
- Keep Supabase database backups/PITR enabled according to the project plan. Periodically test restoring a backup to a separate project. Export and retain migration files alongside source control; storage objects need a separate retention/backup plan because database backups do not contain their bytes.
- Before a real pilot, verify District 5 boundaries and coordinates with the participating barangay, agree on report retention and consent wording, and test every role with separate accounts.

## Role matrix

| Capability | Resident | Responder | Admin |
| --- | --- | --- | --- |
| Submit a report | Yes | Yes | Yes |
| View community map reports, including pending | Yes | Yes | Yes |
| View all pending report details in staff desk | No | Yes | Yes |
| View own pending report history | Yes | Yes | Yes |
| Assign and update report status | No | Yes | Yes |
| Read private report photos | Own uploads | Yes | Yes |
| Create responder accounts | No | No | Yes, with email invitation |
| Change other account roles | No | No | SQL Editor only |

RLS policies in the migration enforce data access in the database; hiding controls in the UI is not treated as authorization.