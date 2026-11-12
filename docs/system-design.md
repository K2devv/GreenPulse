# GreenPulse System Design

**System:** GreenPulse environmental reporting and response coordination for District 5, Quezon City  
**Basis:** Current application source and database migrations in this repository, reviewed 10 November 2026.

## 1. Purpose and scope

GreenPulse lets community members report local environmental issues, lets the public view the community map, and gives city staff a controlled workflow for checking, assigning, and resolving reports. It supports guest reporting with a tracking code and signed-in resident accounts. Responders work on reports assigned to them or their team; administrators manage verification, assignment, teams, inspections, and resolution review.

The deployed product is a React web application that can run as an installable PWA. The repository also contains Capacitor mobile and desktop packaging. In production, Supabase provides authentication, PostgreSQL data, private file storage, row-level security, and realtime updates. Vercel hosts the application and server-side API routes. Without Supabase configuration, the app runs in demo mode with browser-local sample and submitted reports; that data is not shared.

## 2. Actors and permissions

| Actor | Main responsibilities |
| --- | --- |
| Guest reporter | Browse public reports and discussions, submit a report with an email or phone contact, track it with a private code, confirm an issue, and give resolution feedback. |
| Resident | Create an account, submit and track own reports, follow reports, confirm ongoing issues, comment publicly, communicate privately on own reports, and give resolution feedback. |
| Responder | Review the staff queue and report details, communicate on reports, and start or update only reports assigned directly or through a team. Submit response notes and after-photos for administrator review. Complete assigned inspection tasks. |
| Administrator | Verify, reject, mark duplicate, or request information; correct category and urgency; assign responders and teams; review resolutions; reopen reports; manage staff and teams; schedule inspections; configure response thresholds; and view/export analytics. |
| External providers | Photon supports place search; OpenFreeMap provides vector map tiles built from OpenStreetMap data (OpenStreetMap image tiles are the fallback); Google Gemini optionally suggests a report category from a photo; Resend optionally delivers email; Supabase and Vercel provide the backend and hosting services. |

The database enforces access rules with row-level security and workflow triggers. Interface visibility alone is not treated as authorization. Only administrators verify and assign reports or review resolutions. Responders can update only assigned work.

## 3. Use case diagram

```mermaid
flowchart LR
  Guest[Guest reporter]
  Resident[Resident]
  Responder[Responder]
  Admin[Administrator]
  Visitor[Map visitor]

  subgraph GP[GreenPulse]
    UCMap([View community map and report details])
    UCDiscuss([Read public discussion])
    UCComment([Post public comment])
    UCSubmit([Submit environmental report])
    UCTrack([Track guest report by code])
    UCPrivate([Use private report communication])
    UCFollow([Follow or confirm an open report])
    UCFeedback([Confirm resolution or request follow-up])
    UCAuth([Sign up or sign in])
    UCQueue([Review staff report queue and details])
    UCWork([Update assigned task and submit resolution])
    UCInspection([Complete assigned inspection])
    UCVerify([Verify, reject, duplicate, or request information])
    UCAssign([Assign responder/team, priority, and due date])
    UCReview([Review resolution and close or return task])
    UCAdmin([Manage staff, teams, and response settings])
    UCAnalyze([View dashboard and export summaries])
    UCHotspot([Schedule recurring-issue inspection])
  end

  Visitor --> UCMap
  Visitor --> UCDiscuss
  Guest --> UCMap
  Guest --> UCDiscuss
  Guest --> UCSubmit
  Guest --> UCTrack
  Guest --> UCFollow
  Guest --> UCFeedback
  Resident --> UCAuth
  Resident --> UCMap
  Resident --> UCDiscuss
  Resident --> UCComment
  Resident --> UCSubmit
  Resident --> UCPrivate
  Resident --> UCFollow
  Resident --> UCFeedback
  Responder --> UCAuth
  Responder --> UCQueue
  Responder --> UCWork
  Responder --> UCInspection
  Responder --> UCPrivate
  Admin --> UCAuth
  Admin --> UCQueue
  Admin --> UCVerify
  Admin --> UCAssign
  Admin --> UCReview
  Admin --> UCAdmin
  Admin --> UCAnalyze
  Admin --> UCHotspot
  Admin --> UCWork
  Admin --> UCPrivate
  Admin --> UCInspection
```

## 4. Context diagram

GreenPulse is the system boundary. Arrows show the main information exchanged with people and external services.

```mermaid
flowchart LR
  Guest[Guest reporter]
  Resident[Resident]
  Responder[Responder]
  Admin[Administrator]
  Photon[Photon geocoding]
  OSM[OpenFreeMap map tiles]
  Gemini[Google Gemini]
  Resend[Resend email]

  subgraph System[GreenPulse system boundary]
    App[Web app, PWA, mobile/desktop clients]
    API[Vercel API routes]
    Supabase[Supabase Auth, Postgres, Storage, Realtime]
    App <--> API
    App <--> Supabase
    API <--> Supabase
  end

  Guest -->|Report fields, location, photos, contact| App
  App -->|Tracking code, report status, public map| Guest
  Resident -->|Credentials, reports, comments, feedback| App
  App -->|Own reports, map, alerts, timeline| Resident
  Responder -->|Task updates, notes, after-photos| App
  App -->|Assigned queue, report details, alerts| Responder
  Admin -->|Verification, assignment, review, settings| App
  App -->|Queue, dashboard, analytics, alerts| Admin
  App <-->|Place search and coordinates| Photon
  App <-->|Map tile requests and map tiles| OSM
  API <-->|Authenticated photo for category suggestion| Gemini
  API -->|Guest codes and report notifications| Resend
  API -->|Staff notification delivery| Resend
```

**Boundary note:** signed-in users normally call Supabase from the client using their authenticated session. Guest submission, guest tracking, responder provisioning, photo classification, and notification/escalation jobs use server-side API routes. Server-only secrets stay on the server.

## 5. Data-flow diagram (DFD)

### Level 0 — system-level data flows

```mermaid
flowchart LR
  Guest[Guest reporter]
  Resident[Resident]
  Staff[Responder or administrator]
  Maps[Photon and OpenFreeMap]
  AI[Google Gemini]
  Mail[Resend]
  GP((0. GreenPulse))

  Guest -->|Report, contact, photos, tracking request| GP
  GP -->|Tracking code, public reports, status| Guest
  Resident -->|Account actions, reports, comments, follows, feedback| GP
  GP -->|Own report history, map, notifications| Resident
  Staff -->|Verification, assignment, task updates, review| GP
  GP -->|Queue, report details, analytics, alerts| Staff
  GP -->|Place lookup and tile requests| Maps
  Maps -->|Place results and map tiles| GP
  GP -->|Authorized image classification request| AI
  AI -->|Suggested category| GP
  GP -->|Email delivery requests| Mail
  Mail -->|Delivery result| GP
```

### Level 1 — major processes and data stores

```mermaid
flowchart LR
  Guest[Guest reporter]
  Resident[Resident]
  Staff[Responder or administrator]
  Gemini[Google Gemini]
  Resend[Resend]

  P1((1. Identity and access))
  P2((2. Report intake and validation))
  P3((3. Community map and participation))
  P4((4. Staff workflow and inspections))
  P5((5. Communication, alerts, and analytics))
  P6((6. Photo category suggestion))

  D1[(D1 Accounts and roles)]
  D2[(D2 Reports and timeline events)]
  D3[(D3 Private report photos)]
  D4[(D4 Guest access and private contact)]
  D5[(D5 Teams, comments, follows, feedback, notifications, settings)]

  Resident -->|Credentials / OTP| P1
  Staff -->|Credentials / OTP| P1
  P1 <--> D1
  P1 -->|Authenticated session and role| P2
  P1 -->|Role-scoped access| P3
  P1 -->|Staff permissions| P4

  Guest -->|Report, contact, consent, photos| P2
  Resident -->|Report, consent, photos| P2
  P2 -->|Validated report record| D2
  P2 -->|Uploaded image files| D3
  P2 -->|Hashed tracking access and private contact| D4
  P2 -->|Submission event| D2
  P2 -->|Submission status / tracking code| Guest
  P2 -->|Submission status| Resident

  Guest -->|Map view, confirmation, resolution feedback| P3
  Resident -->|Map view, comment, follow, confirmation, feedback| P3
  P3 <--> D2
  P3 <--> D5
  P3 -->|Public-safe reports and discussion| Guest
  P3 -->|Public-safe reports and own report view| Resident

  Staff -->|Verify, assign, update task, review resolution| P4
  P4 <--> D1
  P4 <--> D2
  P4 <--> D3
  P4 <--> D5
  P4 -->|Filtered queue and task details| Staff

  D2 -->|Report lifecycle events| P5
  D5 -->|Comments, follow-up, response settings| P5
  P5 -->|In-app notifications and analytics| D5
  P5 -->|Email request| Resend
  Resend -->|Delivery result| P5
  P5 -->|Dashboard, reports, export| Staff

  Resident -->|Selected photo and request| P6
  P6 -->|Session validation and rate limit| D1
  P6 -->|Image classification request| Gemini
  Gemini -->|Suggested category| P6
  P6 -->|Category suggestion| Resident
```

**Privacy flows:** public map data is a restricted projection of report data. Private report photos, guest email/phone, guest tracking hashes, and additional private details are not exposed through the public map. Guest tracking codes are returned to the reporter; their hashes are stored for access checks. Photo storage is private and access is checked for the uploader or authorized staff.

## 6. System flowchart — report lifecycle

```mermaid
flowchart TD
  Start([Start]) --> Open[Open GreenPulse]
  Open --> Browse{Browse map or report an issue?}
  Browse -->|Browse| PublicMap[Load public-safe reports and map]
  PublicMap --> Action{Choose community action}
  Action -->|Read discussion| Discussion[Read public comments]
  Action -->|Comment or follow| AuthCheck{Signed in?}
  AuthCheck -->|No| SignIn[Sign up or sign in]
  AuthCheck -->|Yes| CommunityAction[Post comment, follow, or confirm issue]
  SignIn --> CommunityAction
  CommunityAction --> Notify[Record event and notify relevant staff/reporters]
  Discussion --> Browse
  Notify --> Browse

  Browse -->|Report issue| ReportForm[Enter issue, category, urgency, time, location, and consent]
  ReportForm --> ReporterType{Reporting as signed-in resident?}
  ReporterType -->|Yes| ValidateResident[Validate required fields, location, consent, and photos]
  ReporterType -->|Guest| GuestContact[Provide email or phone for follow-up]
  GuestContact --> ValidateGuest[Validate fields, location, consent, contact, and photos]

  ValidateResident --> ResidentValid{Valid and online?}
  ResidentValid -->|No: invalid| ReportForm
  ResidentValid -->|No: offline| SaveDraft[Save or queue draft in browser storage]
  SaveDraft --> Reconnect[Wait for connectivity]
  Reconnect --> ValidateResident
  ResidentValid -->|Yes| ResidentSubmit[Upload photos and insert report with signed-in session]

  ValidateGuest --> GuestValid{Valid?}
  GuestValid -->|No| ReportForm
  GuestValid -->|Yes| GuestAPI[Send report to guest-report API]
  GuestAPI --> ServerChecks[Check anti-spam, fields, District 5 location, and rate limit]
  ServerChecks --> ChecksPass{Checks pass?}
  ChecksPass -->|No| ReportForm
  ChecksPass -->|Yes| GuestSave[Save private photos, report, hashed tracking access, and private contact]
  GuestSave --> ReportCreated[Create report and timeline event]
  ResidentSubmit --> ReportCreated
  ReportCreated --> PublicProjection[Show only allowed report fields on community map]
  ReportCreated --> AdminQueue[Add report to staff queue and notify staff]
  ReportCreated --> Receipt{Guest or resident?}
  Receipt -->|Guest| GuestCode[Show tracking code; optionally email it]
  Receipt -->|Resident| ResidentReceipt[Show submission confirmation]
  GuestCode --> EndSubmit([End: report submitted])
  ResidentReceipt --> EndSubmit
  AdminQueue --> AdminReview[Administrator checks report and evidence]
  AdminReview --> Decision{Verification decision}
  Decision -->|Need more information| RequestInfo[Ask reporter for information]
  RequestInfo --> ReporterReply[Reporter replies through private report communication]
  ReporterReply --> AdminReview
  Decision -->|Reject or duplicate| EndUnassigned([End: rejected or duplicate])
  Decision -->|Verify| Assign[Assign responder and/or team, priority, due date, instructions]
  Assign --> ResponderWork[Assigned responder starts work and records progress]
  ResponderWork --> SubmitResolution[Submit response notes and after-photos]
  SubmitResolution --> AdminResolution[Administrator reviews resolution]
  AdminResolution --> ResolutionDecision{Resolution accepted?}
  ResolutionDecision -->|No: changes needed| ReturnWork[Return task to In progress with review note]
  ReturnWork --> ResponderWork
  ResolutionDecision -->|Yes| Resolved[Mark report Resolved]
  Resolved --> ReporterFeedback{Reporter confirms outcome?}
  ReporterFeedback -->|Still happening| Reopen[Administrator reopens for follow-up]
  Reopen --> ResponderWork
  ReporterFeedback -->|Fixed or no follow-up| Close[Administrator closes report]
  Close --> End([End: closed])
```

**Workflow statuses:** `Submitted` / `Under review` → `Verified`, `Additional information requested`, `Rejected`, or `Duplicate`; verified reports can be assigned and worked as `Verified` / `In progress`; responders submit `Awaiting verification`; an administrator approves to `Resolved`, returns it to `In progress`, and then closes it as `Closed`. A resident's “still happening” feedback can prompt an administrator to reopen resolved or closed work.

## 7. Core data model

| Data object | Purpose and important links |
| --- | --- |
| `auth.users`, `profiles` | Sign-in identity and application role (`resident`, `responder`, `admin`). |
| `reports` | Report description, category and issue type, urgency, observation time, coordinates/barangay, consent version, status, assignment, verification, and resolution fields. Guest submissions have no authenticated reporter ID. |
| `report_events` | Append-style history of submission, status, verification, assignment, and resolution changes. |
| `report-photos` storage bucket | Private original and resolution photos; report rows keep storage paths. |
| `guest_report_access` | Guest report token hash, server-only contact email/phone, and tracking metadata. |
| `teams`, `team_members` | Responder groups used for assignment and authorization. |
| `report_comments`, `community_report_comments` | Private report conversation and separate public map discussion. |
| `notifications`, `report_followers`, `report_confirmations`, `report_resolution_feedback` | Recipient-scoped alerts, follows, ongoing-issue confirmations, and reporter outcome feedback. |
| `environmental_followups` | Scheduled inspection tasks linked to recurring report hotspots and assigned teams. |
| `response_settings`, escalation/delivery records | Administrator-set overdue thresholds and SLA/email-delivery tracking. |

## 8. Design constraints and operational notes

- Report submissions require a visibility notice. The public view uses a reduced data projection, generalizes public place labels to a barangay or District 5, and rounds public coordinates. Reporter names can appear only after verification as disclosed in the notice.
- Guest reports require an email or phone, use server-side validation and rate limiting, and return a tracking code. Guest photos are limited to 2.5 MB each; signed-in photos are limited to 5 MB each. Images are compressed in the client before upload.
- Residents can save drafts and queue uploads in IndexedDB. The queue resumes when the app is online; it is a browser-local resilience feature and is not a guaranteed delivery channel.
- Photon place search and map tiles need a network connection. The PWA caches the app shell and static same-origin assets for offline viewing.
- Photo category suggestions are optional, require a signed-in session, and send the selected image to Google Gemini through the server API. The user can choose a category manually.
- Response-time processing and alert emails run through server-side scheduled/manual jobs. In-app notifications do not depend on email delivery.
- District boundary geofencing becomes authoritative only after the District 5 barangay boundary data is loaded and validated. Until then the application uses broad coordinate bounds and a barangay list.
