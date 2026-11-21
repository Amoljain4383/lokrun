# Lokrun – Citizen Civic-Infrastructure Reporting Platform

A lightweight, local civic infrastructure reporting platform developed as a Second-Year Community Engagement Project for Artificial Intelligence & Data Science at **SNJB's KBJ College of Engineering, Chandwad**.

Lokrun enables citizens across the Chandwad municipal and SNJB campus areas to report damaged roads, open drains, waterlogging, broken streetlights, traffic signal faults, and construction hazards. Authorized engineers can triage issues, update resolution pipelines, and record auditable field notes through a dedicated administrator portal.

---

## Technical Architecture & Constraints

- **Pure Node.js Runtime**: Built strictly with standard built-in modules (`http`, `fs`, `path`, `crypto`, `url`). **Zero external npm dependencies**.
- **Offline Capable**: Runs completely locally on Windows PowerShell without external network access or CDN dependencies.
- **Atomic Persistence**: High-integrity atomic JSON database (`data/db.json`) written via temporary staging files and atomic rename operations to prevent partial writes.
- **Security & Privacy by Design**:
  - `crypto.scryptSync` password hashing with cryptographic salts (16-byte random salts, 64-byte key derivation).
  - HttpOnly, SameSite session cookies.
  - Public tracking API (`/api/track/:id`) strictly omits citizen names, phone numbers, emails, and internal notes.
  - Binary magic-byte inspection (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF...WEBP`) to block corrupted or disguised image uploads.
  - Strict textContent-based DOM rendering across all citizen and admin views to eliminate Cross-Site Scripting (XSS).
- **Live Data Only**: Database starts completely clean with only the default administrative credentials. All dashboard metrics, reports, and charts derive directly from live submissions.

---

## Folder Structure

```
d:\projects\Lokrun – A Citizen Civic-Infrastructure Reporting Platform\
├── package.json               # Project manifest ("start": "node server.js")
├── server.js                  # Standalone HTTP backend, router, auth, validation
├── public/                    # Static web assets
│   ├── index.html             # Citizen portal (single scroll hero, 6 categories, report form)
│   ├── track.html             # Public complaint tracking interface
│   ├── admin/                 # Administrator portal
│   │   ├── index.html         # Portal entry redirect
│   │   ├── login.html         # Administrator login
│   │   ├── register.html      # Administrator registration
│   │   ├── dashboard.html     # Live metrics, pure SVG/CSS analytics
│   │   ├── reports.html       # Report manager, search, triage, audit log, print
│   │   ├── profile.html       # Admin profile view
│   │   └── status.html        # Server, database, storage diagnostics & warnings
│   ├── css/
│   │   ├── shared.css         # Design tokens (Teal #176B5D, Navy #142B3A, Coral #E05A47)
│   │   └── admin.css          # Sidebar layout, charts, tables, responsive drawer
│   └── js/
│       ├── report.js          # Citizen form handler, GPS detection & base64 conversion
│       ├── track.js           # Safe public tracker rendering (status timeline only)
│       ├── admin-common.js    # Auth guard, sidebar navigation, user chip
│       ├── admin-login.js     # Admin sign-in controller
│       ├── admin-register.js  # Admin registration controller
│       ├── admin-dashboard.js # Live metric aggregation & pure SVG bar charts
│       ├── admin-reports.js   # Filter, search, detail modal, status PATCH, CSV export
│       ├── admin-profile.js   # Admin profile viewer
│       └── admin-status.js    # Server telemetry & storage monitoring
├── data/
│   └── db.json                # Atomic JSON database (admins, reports, auditLog)
├── uploads/                   # Uploaded citizen photos (<reportId>.<ext>)
├── docs/
│   └── VIVA_NOTES.md          # Comprehensive examination & viva defense notes
└── scripts/
    ├── test-backend.ps1       # Automated PowerShell verification runner
    ├── verify-all.js          # 55-point backend & core isolation test suite
    └── verify-frontend.js     # User flows, GPS fallbacks, and UI verification suite
```

---

## Getting Started

### Prerequisites
- Node.js (v18+ recommended; tested on v24)
- Windows PowerShell

### Running the Server

Start the local server using standard Node.js:
```powershell
npm start
```
*(Or directly: `node server.js`)*

The platform will be accessible locally at:
- **Citizen Portal**: `http://localhost:3000`
- **Track Complaint**: `http://localhost:3000/track.html`
- **Admin Portal**: `http://localhost:3000/admin/login.html`

### Default Administrator Credentials
- **Admin ID**: `lokrun.admin`
- **Password**: `Lokrun@2026`

---

## Deploy on Render

Lokrun can be hosted on Render's free web service tier in minutes.

### 1. GitHub Push Commands
Initialize and push your repository to GitHub:
```bash
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git branch -M main
git push -u origin main
```

### 2. Render Web Service Setup
1. Log in to [Render](https://dashboard.render.com/) and navigate to the Dashboard.
2. Click **New +** > **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repository.
4. Fill in the service details:
   - **Name**: `lokrun` (or your preferred name)
   - **Region**: Choose the region closest to you
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Expand **Advanced** and set:
   - **Health Check Path**: `/healthz`
6. Under **Environment Variables**, add:
   - `PORT`: `3000` *(Optional; Render assigns its own port automatically)*
   - `ADMIN_PASSWORD`: `<your-secure-admin-password>` *(Optional; if set, automatically scrypt-hashes this password for the seeded `lokrun.admin` account on every server start)*
   - `LOKRUN_ALLOW_REGISTRATION`: `false` *(Recommended on public deployments to prevent unauthorized admin account creation; returns 403 and hides the register link)*
   - `LOKRUN_HIDE_DEMO_HINT`: `true` *(Recommended on public deployments to hide default local credential hints on the login page)*
7. Click **Create Web Service**.

### 3. Ephemeral Storage Warning
> [!WARNING]
> **Ephemeral Storage Notice**: On Render's Free instance tier, the local disk is ephemeral and the instance spins down automatically during periods of inactivity. **All submitted citizen reports and uploaded photos in `data/` and `uploads/` will disappear when the free service restarts or sleeps.**
>
> On every fresh start or container restart, Lokrun's backend automatically recreates `data/`, `uploads/`, `data/db.json`, and seeds the default administrator account (`lokrun.admin`).

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP TCP listening port | `3000` |
| `ADMIN_PASSWORD` | Custom password for the seeded `lokrun.admin` account (scrypt hashed on start) | `Lokrun@2026` |
| `LOKRUN_ALLOW_REGISTRATION` | Toggle administrator registration (`false` returns HTTP 403 & hides register UI) | `true` |
| `LOKRUN_HIDE_DEMO_HINT` | Toggle demo credential hints on `/admin/login.html` (`true` hides hint) | `false` |
| `LOKRUN_PIPE` | Optional Windows named pipe or Unix socket for sandbox execution | *(Optional)* |
| `LOKRUN_DATA_DIR` | Custom directory path for `db.json` storage (used by isolated test runner) | `data/` |
| `LOKRUN_UPLOADS_DIR` | Custom directory path for uploads (used by isolated test runner) | `uploads/` |

---

## API Specification

### Citizen & Health Endpoints
- `GET /healthz`: Health check probe for Render/cloud monitoring; returns `"ok"` with status 200.
- `GET /api/config`: Public feature flags returning JSON `{ allowRegistration: boolean, hideDemoHint: boolean }`.
- `GET /` & `/public/*`: Serves static web assets with security headers.
- `POST /api/reports`: Submits new civic complaint with title, description, landmark, optional GPS coordinates, and optional base64 image (JPG/PNG/WEBP, max 5 MB).
- `GET /api/track/:id`: Public tracking endpoint returning reference ID, category, landmark, status, and status transition timestamps. Strictly suppresses all citizen contact details and image files.

### Administrator Endpoints (Cookie Session Protected)
- `POST /api/admin/login`: Authenticates administrator via `scrypt` password verification; issues `HttpOnly; SameSite=Lax` cookie.
- `POST /api/admin/logout`: Invalidates session and clears session cookie.
- `POST /api/admin/register`: Registers a new administrator.
- `GET /api/admin/me`: Returns currently logged-in administrator profile.
- `GET /api/admin/reports`: Lists complaints with keyword search (`search`), status filter (`status`), category filter (`category`), and priority filter (`priority`).
- `GET /api/admin/reports/:id`: Returns full report details including citizen contact information, uploaded photo reference, and complete audit trail.
- `PATCH /api/admin/reports/:id`: Updates priority, status, and/or internal notes; records immutable entry to `auditLog`.
- `GET /api/admin/stats`: Aggregate counts by category, priority, and status.
- `GET /api/admin/export.csv`: Streams all civic reports formatted as downloadable CSV.
- `GET /api/admin/server-status`: Reports process uptime, memory RSS, node version, database statistics, and uploads disk usage.
- `GET /api/admin/image/:id`: Streams uploaded photo to authenticated administrators.

---

## Automated Test Suite

All tests execute inside **isolated temporary directories** so live database records (`data/db.json`) and citizen uploads (`uploads/`) are never polluted.

To run the complete automated test suite in Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-backend.ps1
```

Or execute directly with Node:
```powershell
node scripts/verify-all.js
node scripts/verify-frontend.js
```

---

## Limitations & Future Scope

### Local Prototype Limitations
- **Storage**: Uses single-file atomic JSON (`data/db.json`) suitable for prototype loads, not concurrent enterprise traffic.
- **Network**: Operates over unencrypted local HTTP (`http://localhost:3000`).
- **Access Control**: Simplified two-tier permission model without multi-tier role authorization or email verification.
- **Notifications**: Automated citizen SMS and municipal dispatch emails are not connected.

### Future Scope
1. **Production RDBMS**: Migration to PostgreSQL with PostGIS extension for spatial queries.
2. **Ward GIS Integration**: Municipal boundary mapping and automatic routing to specific municipal ward offices in Chandwad.
3. **Citizen SMS Updates**: Integration with government SMS gateways to alert residents when issue transitions to *In Progress* or *Resolved*.
4. **AI Triage (Community Project Next Phase)**: Automated image classification using computer vision to evaluate road depression depth and auto-assign initial priority.
