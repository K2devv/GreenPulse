# GreenPulse System Design

**System:** GreenPulse environmental reporting and response coordination for District 5, Quezon City  
**Basis:** Current application source and database migrations in this repository, reviewed 19 November 2026.

## 1. Purpose and scope

GreenPulse lets community members report local environmental issues, lets the public view the community map, and gives city staff a controlled workflow for checking, assigning, and resolving reports. It supports guest reporting with a tracking code and signed-in resident accounts. Responders work on reports assigned to them or their team; administrators manage verification, assignment, teams, inspections, and resolution review.

The deployed product is a React web application that can run as an installable PWA. The repository also contains Capacitor mobile and desktop packaging. In production, Supabase provides authentication, PostgreSQL data, private file storage, row-level security, and realtime updates. Vercel hosts the application and server-side API routes. Without Supabase configuration, the app runs in demo mode with browser-local sample and submitted reports; that data is not shared.

## 2. Development methodology

GreenPulse is built with an iterative, incremental method based on Agile. The work is split into short iterations. Each one takes a slice of the system, such as the staff workflow or guest reporting, through planning, design, building, testing, and release, and ends with a version that can be used and checked. What the review finds goes into the backlog for the next iteration.

The method suits the project because the requirements grew as the system took shape. The District 5 boundary check, the privacy rules for public locations and photos, and guest reporting were all added after the first working versions. Short iterations let each of these land as a small, tested change instead of a late redesign.

```mermaid
flowchart LR
  Plan["Plan"] --> Design["Analyze and design"] --> Build["Build"] --> Test["Test"] --> Release["Release"] --> Review["Review"]
  Review -->|findings become backlog items| Plan
```

| Phase | What it involves in GreenPulse |
| --- | --- |
| Plan | Pick the next slice from the backlog and write what each role must be able to do, for example “an administrator can send a resolution back to the responder.” |
| Analyze and design | Model the change before coding it: the report status flow, the tables and access rules, and the screens. Privacy rules are checked here: rounded public coordinates, private photos, and reporter names hidden until a report is verified. |
| Build | Front end in React 19 and TypeScript. Every database or permission change is a new numbered Supabase migration. Server routes are Vercel edge functions. |
| Test | Unit tests (Vitest) for the business rules in `src/lib`, end-to-end tests (Playwright) that run the app in demo mode, and a strict type check that blocks the build. CI runs the tests and build on every push. |
| Release | Merge through a pull request, deploy to Vercel, and apply new migrations in filename order. |
| Review | Check the release against the pilot measures (response and resolution times, reopened reports by barangay) and record what needs fixing as backlog items. |

Iterations so far, from the commit history and migration files:

| Iteration | Dates (2026) | Focus | Delivered | Release |
| --- | --- | --- | --- | --- |
| 1 | 30 Sep – 7 Oct | Foundation | Database schema and roles, report intake, notifications, location map, admin analytics | v0.2.0 |
| 2 | 8 – 15 Oct | Staff workflow | Staff search and filters, barangays and teams, verification, assignment, resolution review, report messages, response times | v0.34.0 |
| 3 | 16 Oct – 2 Nov | Guest reporting and privacy | Guest reports with tracking codes, resolution feedback, recurring-issue inspections, consent notice, public location privacy, deadline escalations, email delivery tracking, pilot outcomes, District 5 boundary check | v0.35.0, v0.36.0 |
| 4 | 3 – 10 Nov | Community and platforms | Rate limits on public endpoints, public comments, guest phone contact, Windows desktop and Android builds | v0.37.0 |
| 5 | 11 – 13 Nov | Maps and accounts | Engagement counts, MapLibre maps limited to District 5, barangay fit and exact addresses for staff, dark mode, email code at sign-up | PR #2 |
| 6 | 14 – 19 Nov | Polish and privacy | Stat tiles that open report lists, notification fixes, paged report loading, focus kept inside dialogs, report photos limited to staff and the reporter, on-device photo suggestions | PRs #3 – #5 |

Tools: GitHub for version control, pull requests, and CI; Vercel for hosting and server routes; Supabase for the database, sign-in, and file storage; Vitest and Playwright for testing.

## 3. Actors and permissions

| Actor | Main responsibilities |
| --- | --- |
| Map visitor | Anyone who opens the site: view the map and report details, search places, filter reports, read public discussion, and confirm an issue is still there. Guest reporters and residents can do everything a map visitor can. |
| Guest reporter | Browse public reports and discussions, submit a report with an email or phone contact, track it with a private code, confirm an issue, and give resolution feedback. |
| Resident | Create an account, submit and track own reports, follow reports, confirm ongoing issues, comment publicly, communicate privately on own reports, and give resolution feedback. |
| Responder | Review the staff queue and report details, communicate on reports, and start or update only reports assigned directly or through a team. Submit response notes and after-photos for administrator review. Complete assigned inspection tasks. |
| Administrator | Verify, reject, mark duplicate, or request information; correct category and urgency; assign responders and teams; review resolutions; reopen reports; manage staff and teams; schedule inspections; configure response thresholds; and view/export analytics. Administrators can also do everything a responder can. |
| Scheduler | The `Deadline checks` GitHub workflow (every 15 minutes) and the daily Vercel cron call the escalation endpoint, which escalates overdue reports and queues alerts. |
| External providers | Photon supports place search; OpenFreeMap provides vector map tiles built from OpenStreetMap data (OpenStreetMap image tiles are the fallback); Hugging Face hosts the open image model (OpenAI CLIP) that the browser downloads once to read report photos and live camera frames on the reporter's own device and fill in the category; Resend optionally delivers email; Supabase and Vercel provide the backend and hosting services. |

The database enforces access rules with row-level security and workflow triggers. Interface visibility alone is not treated as authorization. Only administrators verify and assign reports or review resolutions. Responders can update only assigned work.

## 4. Use case diagram

Community actors use the public features; staff and the scheduler use the response features. A dotted “is a” arrow means the actor can also do everything the target actor can: guest reporters and residents are map visitors, and administrators can do all responder work. Submitting a report always includes the District 5 check; the photo suggestion extends it only when a photo is added.

```mermaid
flowchart LR
  Visitor["Map visitor"]
  Guest["Guest reporter"]
  Resident["Resident"]
  Responder["Responder"]
  Admin["Administrator"]
  Scheduler["Scheduler (system)"]

  subgraph GP["GreenPulse"]
    UC1(["View map and report details"])
    UC2(["Search places, filter reports"])
    UC3(["Read public discussion"])
    UC4(["Confirm issue is still there"])
    UC5(["Track a report with a code"])
    UC6(["Submit environmental report"])
    UC7(["Give resolution feedback"])
    UC8(["Post a public comment"])
    UC9(["Follow a report"])
    UC10(["Check District 5 location"])
    UC11(["Suggest category from photo"])
    UC12(["Sign up or sign in"])
    UC13(["Message on a report"])
    UC14(["Read notifications"])
    UC15(["Review the staff queue"])
    UC16(["Update task, submit resolution"])
    UC17(["Complete an inspection"])
    UC18(["Acknowledge an escalation"])
    UC19(["Verify, reject, mark duplicate"])
    UC20(["Request more information"])
    UC21(["Assign responder or team"])
    UC22(["Review a resolution"])
    UC23(["Schedule an inspection"])
    UC24(["Manage responders and teams"])
    UC25(["Set response deadlines"])
    UC26(["View dashboard and export"])
    UC27(["Run deadline checks"])
  end

  Guest -.->|is a| Visitor
  Resident -.->|is a| Visitor
  Admin -.->|is a| Responder

  Visitor --- UC1 & UC2 & UC3 & UC4
  Guest --- UC5 & UC6 & UC7
  Resident --- UC6 & UC7 & UC8 & UC9 & UC12 & UC13 & UC14
  Responder --- UC12 & UC13 & UC14 & UC15 & UC16 & UC17 & UC18
  Admin --- UC19 & UC20 & UC21 & UC22 & UC23 & UC24 & UC25 & UC26
  Scheduler --- UC27
  UC6 -.->|«include»| UC10
  UC11 -.->|«extend»| UC6
```

The scheduler is the `Deadline checks` GitHub workflow (every 15 minutes) with the daily Vercel cron as a backup.

## 5. Context diagram

GreenPulse is the single process (0). Arrows show the data it exchanges with people and outside services. This is the level 0 view that section 7 breaks down.

```mermaid
flowchart LR
  Guest["Guest reporter"]
  Resident["Resident"]
  Responder["Responder"]
  Admin["Administrator"]
  Scheduler["Scheduler<br/>GitHub Actions, Vercel cron"]
  Mail["Email service<br/>Resend"]
  Maps["Map services<br/>Photon, OpenFreeMap"]
  Model["Model host<br/>Hugging Face"]
  GP(("0<br/>GreenPulse"))

  Guest -->|report, photos, contact, confirmations, feedback| GP
  GP -->|tracking code, status, public map| Guest
  Resident -->|credentials, reports, photos, comments, follows, feedback| GP
  GP -->|session, notifications, map, report status| Resident
  Responder -->|credentials, task updates, after-photos, inspections| GP
  GP -->|session, assigned queue, alerts| Responder
  Admin -->|credentials, decisions, assignments, settings, invites| GP
  GP -->|queue, dashboard, exports, alerts| Admin
  Scheduler -->|deadline check request| GP
  GP -->|email requests| Mail
  Mail -->|delivery results| GP
  GP -->|place search, tile requests| Maps
  Maps -->|places, map tiles| GP
  Model -->|photo model, downloaded once| GP
```

**Boundary note:** the web app and PWA, the Vercel API routes, and Supabase (Auth, Postgres, Storage, Realtime) are inside the boundary. Signed-in users normally call Supabase from the client using their authenticated session. Guest submission, guest tracking, responder provisioning, and notification and escalation jobs use server-side API routes. Photo category suggestions run in the browser, so photos are not sent anywhere for them. Server-only secrets stay on the server.

## 6. System flowchart — report lifecycle

The flowchart follows one report from the form to closing. Colors show who does each step: reporter (blue), GreenPulse system (grey), administrator (green), responder (amber).

```mermaid
flowchart TD
  classDef reporter fill:#e3f0f2,stroke:#4b8a98,color:#1f2a21
  classDef system fill:#f3f7f1,stroke:#829585,color:#1f2a21
  classDef admin fill:#e4f0e4,stroke:#2e6947,color:#1f2a21
  classDef responder fill:#f7efe2,stroke:#b67842,color:#1f2a21

  Start(["Start"]):::reporter --> Form[/"Fill in the report form: issue, place, photos, consent"/]:::reporter
  Form --> SignedIn{"Signed in?"}:::reporter
  SignedIn -->|No| Contact[/"Add email or phone so staff can follow up"/]:::reporter
  SignedIn -->|Yes| Validate["Validate the report: fields, photos, District 5"]:::system
  Contact --> Validate
  Validate --> Valid{"Valid?"}:::system
  Valid -->|No: fix and try again| Form
  Valid -->|Yes| Online{"Online?"}:::system
  Online -->|No| Draft["Save draft on device, queued for upload"]:::reporter
  Draft -->|when back online| Save
  Online -->|Yes| Save["Save the report, photos, and timeline event"]:::system
  Save --> DB[("Reports database and private photos")]:::system
  Save --> Receipt>"Show tracking code or confirmation"]:::reporter
  Receipt --> EndSubmitted(["End: submitted"]):::reporter
  DB -->|alerts administrators| Review["Review the report: details, photos, location"]:::admin
  Review --> Detail{"Enough detail?"}:::admin
  Detail -->|No: ask reporter| Reply[/"Reply with details in report messages"/]:::reporter
  Reply -->|reply| Review
  Detail -->|Yes| Unique{"Valid and not a duplicate?"}:::admin
  Unique -->|No| Outcome>"Show the outcome: Rejected or Duplicate"]:::reporter
  Outcome --> EndRejected(["End"]):::reporter
  Unique -->|Yes| Assign["Verify and assign: responder or team, due date"]:::admin
  Assign --> Work["Work on the task: In progress"]:::responder
  Work --> Submit["Submit notes and photos: Awaiting verification"]:::responder
  Submit --> Accepted{"Resolution accepted?"}:::admin
  Accepted -->|No: needs changes| Work
  Accepted -->|Yes| Resolved["Mark as Resolved"]:::admin
  Resolved -->|reporter notified| Fixed{"Issue fixed?"}:::reporter
  Fixed -->|Still there| Reopen["Reopen for follow-up"]:::admin
  Reopen -->|back to In progress| Work
  Fixed -->|Fixed, or no reply| Close["Close the report: Closed"]:::admin
  Close --> End(["End"]):::admin
```

**Workflow statuses:** `Submitted` → `Under review` → `Verified` → `In progress` → `Awaiting verification` → `Resolved` → `Closed`. A report can also leave review as `Additional information requested`, `Rejected`, or `Duplicate`. Separately from this flow, the scheduled deadline checks escalate reports whose response time has passed and alert the assigned staff.

## 7. Data-flow diagram (DFD) — level 1

Level 0 is the context diagram in section 5. Level 1 opens it into six processes and six data stores. Every flow to or from an outside entity matches a flow in the context diagram.

```mermaid
flowchart LR
  Guest["Guest reporter"]
  Resident["Resident"]
  Responder["Responder"]
  Admin["Administrator"]
  Maps["Map services"]
  Model["Model host"]
  Scheduler["Scheduler"]
  Mail["Email service"]

  P1(("1.0 Manage accounts and inbox"))
  P2(("2.0 Receive and track reports"))
  P3(("3.0 Suggest category from photo"))
  P4(("4.0 Publish map and community activity"))
  P5(("5.0 Coordinate the response"))
  P6(("6.0 Monitor deadlines, notify and report"))

  D1[("D1 Accounts and teams")]
  D2[("D2 Reports and timeline")]
  D3[("D3 Report photos")]
  D4[("D4 Guest access and contacts")]
  D5[("D5 Community activity")]
  D6[("D6 Notifications and deadlines")]

  Guest -->|report, photos, contact| P2
  P2 -->|tracking code, status| Guest
  Resident -->|report, photos| P2
  P2 -->|receipt, status| Resident
  P2 -->|photo| P3
  P3 -->|suggestion| P2
  Model -->|photo model| P3
  P2 -->|photos| D3
  P2 -->|hash, contact| D4
  D4 -->|access check| P2
  P2 -->|new report| D2
  D2 -->|status| P2

  Guest -->|confirmation, feedback| P4
  P4 -->|public reports| Guest
  Resident -->|comments, follows, confirmation, feedback| P4
  P4 -->|map, discussion| Resident
  Maps -->|places, map tiles| P4
  P4 -->|place, tile requests| Maps
  D2 -->|public fields| P4
  P4 -->|activity| D5
  D5 -->|discussion| P4

  Resident -->|credentials, profile| P1
  Responder -->|credentials| P1
  Admin -->|credentials, invites, teams| P1
  P1 -->|session, notifications| Resident
  P1 -->|session, notifications| Responder
  P1 -->|session, notifications| Admin
  P1 -->|profile| D1
  D1 -->|role, teams| P1
  P1 -->|read marks| D6
  D6 -->|notifications| P1

  Admin -->|decisions, assignments| P5
  P5 -->|queue, report details| Admin
  Responder -->|task updates, photos, inspection results| P5
  P5 -->|assigned tasks| Responder
  D1 -->|staff, teams| P5
  P5 -->|after-photos| D3
  D3 -->|evidence| P5
  P5 -->|decisions| D2
  D2 -->|queue data| P5

  Scheduler -->|deadline check| P6
  Admin -->|deadline settings| P6
  P6 -->|dashboard, exports| Admin
  P6 -->|email requests| Mail
  Mail -->|delivery results| P6
  D2 -->|events, dates| P6
  P6 -->|notifications| D6
  D6 -->|deadlines| P6
  D1 -->|email prefs| P6
  D4 -->|guest contact| P6
```

| No. | Process | What it does |
| --- | --- | --- |
| 1.0 | Manage accounts and inbox | Sign-up with an email code, sign-in, profiles and roles, responder invitations, teams, and each user’s notification inbox. |
| 2.0 | Receive and track reports | Checks and saves reports from guests and residents, stores photos privately, rate-limits guests, issues tracking codes, and answers tracking lookups. |
| 3.0 | Suggest category from photo | Runs an image model in the reporter’s browser and suggests a category, issue type, and title. The photo stays on the device. |
| 4.0 | Publish map and community activity | Serves the public view of reports with rounded coordinates and general place names, plus comments, follows, confirmations, and feedback. |
| 5.0 | Coordinate the response | Staff queue, verification, assignment, task updates, after-photos, and resolution review. Every change is written to the timeline. |
| 6.0 | Monitor deadlines, notify and report | Checks deadlines, escalates overdue reports, creates notifications, sends email, and builds dashboard figures and exports. |

| Store | Holds | Tables |
| --- | --- | --- |
| D1 | Accounts and teams | `profiles`, `teams`, `team_members` |
| D2 | Reports and timeline | `reports`, `report_events`, `report_comments`, `environmental_followups` |
| D3 | Report photos | `report-photos` private storage bucket |
| D4 | Guest access and contacts | `guest_report_access`, `guest_report_attempts`, `api_rate_events` |
| D5 | Community activity | `community_report_comments`, `report_followers`, `report_confirmations`, `report_resolution_feedback` |
| D6 | Notifications and deadlines | `notifications`, `report_sla_escalations`, `response_settings` |

**Privacy flows:** public map data is a restricted projection of report data. Private report photos, guest email and phone, guest tracking hashes, and additional private details are not exposed through the public map. Guest tracking codes are returned to the reporter; only their hashes are stored. Photo storage is private and access is checked for the uploader or authorized staff.

## 8. Entity relationship diagram (ERD)

The database has 18 tables in the `public` schema. `reports` is the centre. `profiles.id` is the same id as Supabase’s `auth.users.id`, so foreign keys to `auth.users` (`reports.reporter_id`, `report_events.actor_id`, `report_confirmations.reporter_id`) are shown against `profiles`. Only key and core columns are listed.

```mermaid
erDiagram
  profiles ||--o{ team_members : "belongs to"
  teams ||--o{ team_members : has
  teams |o--o{ environmental_followups : "assigned to"
  profiles ||--o{ environmental_followups : creates
  profiles |o--o| response_settings : updates
  profiles |o--o{ reports : submits
  profiles |o--o{ reports : "assigned to"
  teams |o--o{ reports : "assigned team"
  reports |o--o{ reports : "duplicate of"
  profiles ||--o{ notifications : receives
  reports ||--o{ notifications : triggers
  profiles ||--o{ report_followers : follows
  reports ||--o{ report_followers : "followed by"
  profiles |o--o{ report_comments : writes
  reports ||--o{ report_comments : "private messages"
  profiles ||--o{ community_report_comments : writes
  reports ||--o{ community_report_comments : "public comments"
  reports ||--o{ report_events : records
  reports ||--o| guest_report_access : "guest access"
  report_events |o--o{ guest_report_access : "last emailed"
  reports ||--o{ report_sla_escalations : escalates
  reports ||--o{ report_confirmations : "confirmed by"
  reports ||--o| report_resolution_feedback : "feedback on"

  profiles {
    uuid id PK, FK
    text display_name
    text role
    text avatar_path
    boolean email_notifications
    timestamptz created_at
  }
  teams {
    uuid id PK
    text name
    timestamptz created_at
  }
  team_members {
    uuid team_id PK, FK
    uuid profile_id PK, FK
    timestamptz created_at
  }
  environmental_followups {
    uuid id PK
    text title
    text category
    text barangay
    text status
    uuid[] source_report_ids
    uuid assigned_team_id FK
    date due_date
    uuid created_by FK
    timestamptz completed_at
  }
  response_settings {
    boolean singleton PK
    smallint response_sla_hours
    smallint high_urgency_sla_hours
    uuid updated_by FK
  }
  reports {
    uuid id PK
    uuid reporter_id FK
    text title
    text category
    text issue_type
    text status
    text urgency
    text description
    text barangay
    text location_label
    float8 latitude
    float8 longitude
    timestamptz observed_at
    text[] photo_paths
    text consent_version
    uuid assigned_to FK
    uuid assigned_team_id FK
    uuid verified_by FK
    uuid duplicate_of FK
    text task_priority
    date due_date
    text[] resolution_photo_paths
    text resolution_decision
    uuid resolution_reviewed_by FK
    uuid client_submission_id
    timestamptz created_at
    timestamptz resolved_at
  }
  report_events {
    bigint id PK
    uuid report_id FK
    uuid actor_id FK
    text event_type
    text message
    timestamptz created_at
  }
  report_comments {
    bigint id PK
    uuid report_id FK
    uuid author_id FK
    text author_role
    text kind
    text message
    text[] photo_paths
  }
  community_report_comments {
    bigint id PK
    uuid report_id FK
    uuid author_id FK
    text author_name
    text message
  }
  notifications {
    bigint id PK
    uuid recipient_id FK
    uuid report_id FK
    text event_type
    text title
    text message
    timestamptz read_at
    text email_delivery_status
  }
  report_followers {
    uuid report_id PK, FK
    uuid profile_id PK, FK
    timestamptz created_at
  }
  guest_report_access {
    uuid report_id PK, FK
    text access_token_hash
    text contact_email
    text contact_phone
    bigint last_email_notification_event_id FK
    uuid client_submission_id
  }
  report_sla_escalations {
    uuid report_id PK, FK
    smallint stage PK
    timestamptz escalated_at
    timestamptz acknowledged_at
    uuid acknowledged_by FK
  }
  report_confirmations {
    bigint id PK
    uuid report_id FK
    uuid reporter_id FK
    text guest_ip_hash
    timestamptz created_at
  }
  report_resolution_feedback {
    uuid report_id PK, FK
    text feedback
    text message
    timestamptz updated_at
  }
  district5_barangay_boundaries {
    text barangay PK
    jsonb geometry_geojson
    text source_label
    text source_url
    boolean indicative
    timestamptz imported_at
  }
  guest_report_attempts {
    bigint id PK
    text ip_hash
    timestamptz created_at
  }
  api_rate_events {
    bigint id PK
    text subject_hash
    text action
    timestamptz created_at
  }
```

Foreign keys without a relationship line (`verified_by`, `resolution_reviewed_by`, `actor_id`, `acknowledged_by`, and `report_confirmations.reporter_id`) all point to `profiles`. `district5_barangay_boundaries`, `guest_report_attempts`, and `api_rate_events` have no foreign keys.

| Data object | Purpose and important links |
| --- | --- |
| `auth.users`, `profiles` | Sign-in identity and application role (`resident`, `responder`, `admin`). |
| `reports` | Report description, category and issue type, urgency, observation time, coordinates and barangay, consent version, status, assignment, verification, and resolution fields. Guest submissions have no authenticated reporter ID. |
| `report_events` | Append-style history of submission, status, verification, assignment, and resolution changes. |
| `report-photos` storage bucket | Private original and resolution photos; report rows keep storage paths. |
| `guest_report_access` | Guest report token hash, server-only contact email or phone, and tracking metadata. |
| `teams`, `team_members` | Responder groups used for assignment and authorization. |
| `report_comments`, `community_report_comments` | Private report conversation and separate public map discussion. |
| `notifications`, `report_followers`, `report_confirmations`, `report_resolution_feedback` | Recipient-scoped alerts, follows, ongoing-issue confirmations, and reporter outcome feedback. |
| `environmental_followups` | Scheduled inspection tasks linked to recurring report hotspots and assigned teams. |
| `response_settings`, `report_sla_escalations` | Administrator-set overdue thresholds and escalation records; email delivery status sits on `notifications` and `guest_report_access`. |
| `district5_barangay_boundaries` | The 14 barangay outlines the database uses to refuse reports from outside District 5. |
| `guest_report_attempts`, `api_rate_events` | Hashed request records for guest and public endpoint rate limits. |
| `community_reports` (view) | The public projection the map reads: rounded coordinates, generalized place labels, no private fields or rejected reports. |

## 9. Site map

GreenPulse is a single-page app. Its views switch in place instead of loading separate pages, and forms open as dialogs, which become bottom sheets on phones. Labels in parentheses show who can reach a part when that differs from its parent.

```mermaid
flowchart LR
  Root["GreenPulse"]
  Root --> C["Community view (everyone)"]
  Root --> F["Report an issue (everyone)"]
  Root --> S["Staff desk (responder, admin)"]
  Root --> A["Admin dashboard (admin)"]
  Root --> H["Header and account (everyone)"]

  C --> C1["Hero summary: stat tiles open report lists"]
  C --> C2["Incident map: pins, clusters, heatmap, legend"]
  C --> C3["Map search and my location"]
  C --> C4["Report preview: photos for staff and the reporter"]
  C --> C5["Comments and discussion (residents post)"]
  C --> C6["Recent reports list: search, filters, sort"]
  C --> C7["Report card actions: still there, discuss, follow"]
  C --> C8["Your report: Was this issue fixed? (reporter)"]
  C --> C9["Welcome tour"]

  F --> F1["Issue details: title, category, urgency, time"]
  F --> F2["Photos and on-device suggestion"]
  F --> F3["Location picker: District 5 only, barangay autofill"]
  F --> F4["Guest contact: email or phone (guest)"]
  F --> F5["Consent notice"]
  F --> F6["Draft and offline queue"]
  F --> F7["Receipt: tracking code for guests"]

  S --> S1["Deadline escalations"]
  S --> S2["Recurring issues: inspections and follow-ups"]
  S --> S3["Response queue: search and filters, 50 per page"]
  S --> S4["Report detail: workflow panel, exact address"]
  S --> S5["Conversation and timeline"]
  S --> S6["Add a responder (admin)"]
  S --> S7["Manage teams (admin)"]

  A --> A1["Overview: counts and average times"]
  A --> A2["Charts: trends over a date range"]
  A --> A3["Report summary: export PDF, Excel or CSV"]
  A --> A4["Pilot outcomes: response times by barangay"]
  A --> A5["Operations: deadlines, escalations, email delivery, workload"]

  H --> H1["Sign in or create account"]
  H --> H2["Track a report (guest)"]
  H --> H3["Notifications (signed in)"]
  H --> H4["Profile settings (signed in)"]
  H --> H5["Display settings: dark mode, high contrast, reduced motion, compact lists"]
  H --> H6["Command palette: Ctrl or Cmd + K"]
```

## 10. Design constraints and operational notes

- Report submissions require a visibility notice. The public view uses a reduced data projection, generalizes public place labels to a barangay or District 5, and rounds public coordinates. Reporter names can appear only after verification as disclosed in the notice.
- Guest reports require an email or phone, use server-side validation and rate limiting, and return a tracking code. Guest photos are limited to 2.5 MB each; signed-in photos are limited to 5 MB each. Images are compressed in the client before upload.
- Residents can save drafts and queue uploads in IndexedDB. The queue resumes when the app is online; it is a browser-local resilience feature and is not a guaranteed delivery channel.
- Photon place search and map tiles need a network connection. The PWA caches the app shell and static same-origin assets for offline viewing.
- Photo category suggestions run on the reporter's device for guests and signed-in users alike; the photo is never sent anywhere for them. The image model (about 64 MB) is downloaded once from Hugging Face, checked against a pinned SHA-256, and cached; phones on mobile data are asked before the download. The reporter can always change the suggestion or choose by hand.
- Response-time processing and alert emails run through server-side scheduled/manual jobs. In-app notifications do not depend on email delivery.
- Reports outside District 5 are refused in three places: the report form, the guest endpoint, and a database trigger. The trigger enforces only once `district5_barangay_boundaries` has rows; `202611120001_district5_osm_boundaries.sql` loads the bundled barangay outlines for that. The outlines are indicative and should be validated with the participating Quezon City office before a pilot.
