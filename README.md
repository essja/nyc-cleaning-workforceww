# Enterprise Workforce Management Platform
> Production-ready, multi-tenant workforce scheduling, biometric attendance verification, and deterministic payroll system designed to compete with and replace StaffClock.

---

## 🌟 Key Capabilities & Architectural Pillars

| Feature Domain | Production Capability | StaffClock Comparison |
| :--- | :--- | :--- |
| **Multi-Tenancy** | Composite tenant isolation with `organization_id` foreign keys & unique constraints across 30 tables. | Completely isolates tenants; supports multi-company portfolios. |
| **Configurable Work Week** | Dynamic day-of-week indexing (e.g. `Sunday → Saturday` for commercial cleaning vs `Monday → Sunday`). | Configurable per organization without code modifications. |
| **Biometrics Layer** | Hardware Abstraction Layer (`IBiometricDeviceAdapter`) decoupled from device models + Native WebAuthn on mobile. Never stores raw biometric vectors. | Compatible with physical network terminals (ZKTeco, Anviz) and employee smartphones. |
| **Geofencing & Verification** | Haversine great-circle GPS calculations with customizable site radiuses (e.g. 50m to 500m) and circular boundary checks. | Real-time map pins, automatic out-of-bounds flagging, and distance calculation. |
| **Scheduling Engine** | Overlapping shift detection, double-booking prevention, and approved leave conflict warnings. | Sunday–Saturday visual matrix with instant schedule assignment. |
| **Deterministic Payroll** | 100% rule-based payroll engine (Daily 8h & Weekly 40h OT, 1.5x/2.0x multipliers, Excel `.xlsx` timesheet exports). Zero AI in financial math. | Eliminates human calculation errors; fully exportable to payroll processors. |
| **Offline-First Sync** | Client-generated UUIDs with FIFO event replay and idempotent duplicate suppression. | Employees can clock in/out in basements or parking structures with zero connectivity. |
| **Workforce Intelligence** | Explainable AI anomaly detection (understaffing warnings, tardiness patterns, overtime hotspots) + Grounded Management Q&A. | Gives managers proactive staffing intelligence without compromising payroll integrity. |

---

## 🚀 Quick Start Guide

### 1. Requirements
- **Node.js**: v20+ or v24+
- **NPM**: v10+

### 2. Installation & Setup
```bash
# 1. Install all monorepo dependencies
npm install

# 2. Run Database Migrations & Multi-Tenant Seed
npm run db:migrate --workspace=packages/server
npm run db:seed --workspace=packages/server

# 3. Execute Complete Integration Test Suite (30/30 Tests)
npm test --workspace=packages/server
```

### 3. Running Locally
Start both backend API and React client concurrently:
```bash
# Terminal 1: Backend Server (runs on http://localhost:4000)
npm run dev --workspace=packages/server

# Terminal 2: Vite Client UI (runs on http://localhost:5173)
npm run dev --workspace=packages/client
```

---

## 🔑 Pre-Seeded Demonstration Accounts

All accounts use the universal demonstration password: `Password123!`

| Organization | Role | Email | Features / Scope |
| :--- | :--- | :--- | :--- |
| **Apex Facility Solutions** (Sunday Start) | `OWNER` / `ADMIN` | `admin@apex.com` | Full administrative control, all buildings, payroll approvals, device manager. |
| **Apex Facility Solutions** | `MANAGER` | `manager@apex.com` | Downtown Medical Plaza supervisor, live attendance, shift scheduling. |
| **Apex Facility Solutions** | `EMPLOYEE` | `john.doe@apex.com` | Custodian; Employee Mobile App portal, GPS check-in/out, personal history. |
| **Prime Property Services** (Monday Start) | `ADMIN` | `admin@primeservices.com` | Second tenant; used to verify strict database multi-tenant isolation. |

---

## 🏗️ System Architecture & Directory Structure

```
├── packages/
│   ├── server/                          # Production Express Backend
│   │   ├── src/
│   │   │   ├── adapters/biometrics/     # Hardware Abstraction Layer & Mock Terminal Adapter
│   │   │   ├── db/                      # Node 24 native SQLite engine, DDL schema, migrations, seed
│   │   │   ├── middleware/              # JWT, RBAC, Building Scoping, Tenant Isolation
│   │   │   ├── modules/                 # Auth, Buildings, Employees, Scheduling, Attendance, Payroll, Leave, Reports, Audit, Sync, AI
│   │   │   ├── utils/                   # Haversine Geofence math, Token utilities
│   │   │   └── server.ts                # Express application entrypoint
│   │   └── tests/                       # 6 Comprehensive Vitest Integration Suites (30 passing tests)
│   │
│   └── client/                          # Production React 18 + Vite Frontend
│       ├── src/
│       │   ├── api/                     # Typed API client, tenant headers, offline punch queue
│       │   ├── context/                 # AuthContext with online/offline auto-sync & tenant switcher
│       │   ├── components/              # Enterprise layout, responsive navigation, status badge
│       │   ├── pages/                   # Dashboard, Buildings & Map, Employees & Bulk Import, Scheduling, Attendance, Payroll, Leave, Devices, Intelligence, Audit
│       │   └── mobile/                  # Dedicated Employee Mobile Clock-In App (PWA)
│
├── docker-compose.yml                   # Production container stack (Postgres + Backend + Nginx)
├── Dockerfile.server                    # Multi-stage production container for API
├── Dockerfile.client                    # Multi-stage production container with Nginx
└── nginx.conf                           # Client routing & API reverse proxy configuration
```

---

## 📊 First End-to-End Workflow Verification

The system was verified against the master test path:
1. **Employee Import**: Imported from spreadsheet batch with salary/hourly rates and department provisioning.
2. **Facility Assignment**: Assigned to building with configured 150m geofence radius.
3. **Sunday–Saturday Schedule**: Created shift for target day; conflict detection validated.
4. **Employee Mobile Punch**: Mobile WebAuthn biometric authentication + GPS Haversine verification within 150m.
5. **Real-time Ingestion**: Attendance session opened; active status streamed to Admin Live Dashboard.
6. **Break & Checkout**: Recorded 30m break and checkout punch; regular and overtime hours computed.
7. **Deterministic Payroll**: Pay period generated; daily 8h and weekly 40h thresholds applied; timesheet exported to `.xlsx`.
