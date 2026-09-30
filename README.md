# GreenPulse

Responsive environmental reporting and response coordination for District 5, Quezon City.
Production: https://greenpulse-district5.vercel.app

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install` and `npm run dev`.
3. Without Supabase environment variables, the app runs in demo mode. Reports in demo mode are local to this browser and are not shared.

## Connect Supabase

1. Create a Supabase project and copy its project URL and publishable/anon key.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL`.
3. In the Supabase SQL Editor, run `supabase/migrations/202609300001_greenpulse_initial_schema.sql`.
4. In Authentication settings, enable email/password sign-in and configure the email confirmation policy appropriate for the pilot.
5. Sign up using your own account. Promote the first administrator from the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

6. Promote authorized community responders to `responder` using the same query with that role. Do not expose a service-role key in the browser or commit `.env.local`.
7. Restart the Vite server after changing environment variables.

Reports require a signed-in resident account. Residents can submit and view their own pending reports; the public map view exposes only verified, in-progress, or resolved reports and omits reporter identity and photo paths. Responders and administrators can review all reports, assign a responder, change status, and record resolution details. Role changes are performed by an administrator in the Supabase SQL Editor; users cannot promote themselves.

Uploaded images use a private `report-photos` bucket, are limited to JPEG/PNG/WebP and 5 MB, and are readable only by their uploader or staff. Report coordinates and landmark descriptions are stored in the reports table. The database trigger records report submission, status transitions, assignment changes, and resolution-note edits in `report_events`.

Location suggestions use the Photon geocoding API, with the search centered near District 5; the user must select a suggested place or GPS location before submission. Map tiles and place data are attributed to OpenStreetMap contributors.

Signup confirmation links use `VITE_APP_URL`, falling back to the current site's origin when it is not set. Set `VITE_APP_URL` to `https://greenpulse-district5.vercel.app` in Vercel and configure Supabase **Authentication → URL Configuration** with this Site URL and these allowed redirect URLs:

- `https://greenpulse-district5.vercel.app/**`
- `http://localhost:5173/**`

The Supabase built-in email sender is rate-limited. For pilot signups, configure a custom SMTP provider under Supabase Auth email settings. The app displays confirmation state and offers a resend action, but it cannot bypass Supabase delivery limits.

## Deployment and operations

- Run `npm test` and `npm run build`; the Vercel production deployment is `https://greenpulse-district5.vercel.app`.
- Set the two `VITE_SUPABASE_*` values in the hosting provider's environment settings. These are public client values; never put the Supabase service-role key in the frontend.
- Configure the production site URL and allowed redirect URLs in Supabase Authentication settings, enable email confirmation, and use HTTPS.
- Keep Supabase database backups/PITR enabled according to the project plan. Periodically test restoring a backup to a separate project. Export and retain migration files alongside source control; storage objects need a separate retention/backup plan because database backups do not contain their bytes.
- Before a real pilot, verify District 5 boundaries and coordinates with the participating barangay, agree on report retention and consent wording, and test every role with separate accounts.

## Role matrix

| Capability | Resident | Responder | Admin |
| --- | --- | --- | --- |
| Submit a report | Yes | Yes | Yes |
| View verified community reports | Yes | Yes | Yes |
| View own pending report and history | Yes | Yes | Yes |
| View all pending reports | No | Yes | Yes |
| Assign and update report status | No | Yes | Yes |
| Read private report photos | Own uploads | Yes | Yes |
| Change account roles | No | No | SQL Editor only |

RLS policies in the migration enforce data access in the database; hiding controls in the UI is not treated as authorization.