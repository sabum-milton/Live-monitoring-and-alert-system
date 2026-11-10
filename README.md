# CareWatch — Intelligent Patient Monitoring & Nurse Alert Dashboard

> A university hardware-engineering project: an ESP32 bedside prototype measures vital signs
> and transmits them wirelessly; CareWatch validates, classifies and stores those
> measurements, then routes alerts to the nurse on duty with a complete acknowledgment and
> resolution audit trail.

[![Made with Next.js](https://img.shields.io/badge/Next.js-13.5-black?logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-green?logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.3-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)

---

> **Not a medical device.** CareWatch is a university prototype. It applies configured
> rules to reported measurements. It does not diagnose disease, does not predict clinical
> outcomes, and is not a substitute for professional medical assessment. All thresholds
> shipped with the project are illustrative demonstration values that require clinical
> review before any real use.

---

## Table of contents

1. [What the dashboard answers](#what-the-dashboard-answers)
2. [Scope](#scope)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Data model](#data-model)
6. [Security model](#security-model)
7. [Quickstart](#quickstart)
8. [Demonstration mode](#demonstration-mode)
9. [Connecting a physical ESP32](#connecting-a-physical-esp32)
10. [Tests](#tests)
11. [Project layout](#project-layout)
12. [Deployment](#deployment)
13. [License](#license)

---

## What the dashboard answers

1. **Who is the patient?** — patient header card with ID, bed, device and monitoring start.
2. **What are their current vital signs?** — one card per parameter with value, unit, limits and trend.
3. **Is their condition normal, abnormal or critical?** — overall classification banner with the reason.
4. **Which parameter triggered an alert, and why?** — every alert stores the measured value and the rule that fired.
5. **Has a nurse received and acknowledged the alert?** — delivery state, acknowledgment and resolution record.

---

## Scope

The hardware prototype monitors **one patient at a time**. The application is built around a
single active patient and a single assigned device. Every reading, alert and event still stores
both the patient ID and the assignment ID, so multi-patient support can be added later without
losing or rewriting history.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 13.5](https://nextjs.org/) (App Router, React 18, TypeScript) |
| Styling | [Tailwind CSS 3.3](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Lucide](https://lucide.dev/) icons |
| Charts | [Recharts](https://recharts.org/) |
| Forms & validation | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Backend | [Supabase](https://supabase.com/) — managed PostgreSQL, Auth, Edge Functions |
| Live updates | Database polling every 3 seconds plus in-dashboard notifications |
| Edge runtime | Deno (Supabase Edge Functions) — the `ingest-vitals` function |
| Hardware path | MQTT topic → ingest endpoint → database → dashboard |

---

## Architecture

> The deployment target for this project is a Next.js application with a Supabase backend.
> The specification's FastAPI/SQLAlchemy service layer is replaced by an equivalent
> server-side tier on the same managed PostgreSQL database: the rule engine, request
> validation, alert cooldown logic and audit logging that would have lived in FastAPI live
> in the `ingest-vitals` edge function and in `SECURITY DEFINER` database functions. The
> design stays modular, so the ingest function can be swapped for a FastAPI service without
> touching the frontend or the schema.

**Live transport note:** WebSockets were specified for real-time push. Supabase Realtime
(WebSocket channels) requires enabling replication per table on the hosted project. Until
that is enabled, the dashboard polls every 3 seconds — a full refresh of patient, device,
reading and alert state — which keeps every page live without a page reload. Enabling
Realtime later is a matter of subscribing to the same tables; no page logic changes.

---

## Data model

`profiles`, `nurses`, `patients`, `devices`, `device_assignments`, `vital_readings`,
`alerts`, `alert_acknowledgments`, `system_events`, `threshold_configurations`,
`system_settings`.

Key integrity rules enforced in the database:

- A partial unique index guarantees **one active assignment per device** and **one active assignment per patient**.
- Readings are attributed using the **device assignment**, never a patient ID sent by the ESP32.
- Only one patient is flagged active at a time, and closing an assignment records its end time.
- Timestamps are stored in UTC and rendered in the viewer's local timezone.

---

## Security model

- Email/password sign-in. The dashboard is unusable without an authenticated session.
- The first account created becomes the **administrator**; later accounts are **nurses**.
- Row level security is enabled on every table. Reads are shared across signed-in clinical
  staff; writes are deliberately narrow.
- `vital_readings`, `alerts` and `alert_acknowledgments` are read-only to the browser. They
  are written only by the ingest function and by authorised workflow functions.
- Alert acknowledgment, resolution, patient/device reassignment and audit logging run through
  `SECURITY DEFINER` functions that derive the actor from the session. A caller cannot forge
  who acknowledged or resolved an alert.
- Role is a database column that the browser cannot write. Only administrators can change
  thresholds and operational settings.
- Notification provider credentials live in environment variables and never reach the browser.

---

## Quickstart

### Prerequisites

- Node.js 18+ and npm
- A Supabase project (free tier is fine)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your Supabase project credentials:

```bash
cp .env.example .env
```

```env
# Required — find these in your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional — server-side only, for remote notification delivery
CAREWATCH_NOTIFICATION_WEBHOOK_URL=
```

### 3. Apply database migrations

Run the SQL files in `supabase/migrations/` against your Supabase project, in order:

1. `20261002131003_carewatch_core_schema.sql`
2. `20261002131030_carewatch_functions_and_seed.sql`
3. `20261002131707_carewatch_protect_history.sql`
4. `20261002131921_carewatch_primary_device_sensors.sql`
5. `20261002132026_carewatch_lock_internal_helpers.sql`

### 4. Deploy the ingest edge function

Deploy `supabase/functions/ingest-vitals/` to your Supabase project. The function is
configured with `verify_jwt = false` so the ESP32 (or MQTT bridge) can POST samples without
a user session.

### 5. Run the dev server

```bash
npm run dev
```

### 6. First run

1. Create an account on the sign-in screen. The first account becomes the administrator.
2. Open **Patient Profile**, register a patient and assign a device (`ESP32-001` is seeded).
3. Open **Settings → Thresholds** to review the demonstration limits.
4. Start the demonstration generator from **Overview** or **Settings**.

---

## Demonstration mode

The simulation control panel can Start, Stop, Reset and switch between five scenarios. Every
simulated sample is labelled `SIMULATED` and passes through the same ingest endpoint, rule
engine, cooldown logic and alert workflow that hardware data uses.

| Scenario | Demonstrates |
| --- | --- |
| Normal | Healthy readings inside every configured limit |
| Abnormal | Heart rate, SpO2 and temperature drift past warning limits |
| Critical | Multiple parameters cross critical limits, raising critical alerts |
| Sensor disconnected | Respiratory sensor drops out; signal quality degrades; device goes silent |
| Recovery | Readings return smoothly to baseline, allowing alerts to be resolved |

The generator is driven by the signed-in browser and posts to the ingest endpoint, so a
second viewer of the dashboard sees the same readings and alerts. It stops when the tab is
closed or when **Stop** is pressed.

---

## Connecting a physical ESP32

1. Publish JSON to the device topic, for example `carewatch/devices/ESP32-001/vitals`:

   ```json
   {
     "device_id": "ESP32-001",
     "timestamp": "2026-10-02T13:42:08Z",
     "heart_rate": 82,
     "spo2": 97,
     "temperature": 36.8,
     "respiratory_rate": null,
     "signal_quality": "valid"
   }
   ```

2. Bridge the broker topic to the CareWatch ingest endpoint, or POST the payload directly
   from the ESP32 when Wi-Fi is available. The endpoint accepts 3–15 s publish intervals
   comfortably; malformed payloads are rejected, logged with the reason, and never stored.
3. Assign the device to the active patient on the **Patient Profile** page. Until a device is
   assigned, its readings are rejected for monitoring and recorded as `UNASSIGNED_DEVICE_READING`
   events.
4. Confirm the connection on the **Device Status** page. A silent device raises a connectivity
   warning and is never reported as a healthy patient.

The MQTT bridge is deliberately kept out of the frontend. Only the ingest endpoint talks to
the database.

---

## Tests

```bash
npm test
```

Runs the rule-engine and workflow suite with Node's built-in test runner:

- patient/device assignment, including unassigned and closed assignments
- reading validation: plausibility bounds, non-numeric values, timestamp clamping
- alert generation: warning vs critical classification, sensor-unavailable handling, trend escalation
- overall condition escalation and explainable reasons
- alert flooding protection: open-alert de-duplication and cooldown, with critical escalation exempt
- acknowledgment and resolution as separate workflow steps
- device disconnection vs stale data vs healthy connection

---

## Project layout

```
app/                     Pages: overview, patient, monitoring, alerts, history, device, settings
components/carewatch/    Dashboard shell, sidebar, vital cards, alert drawer, simulation panel
components/ui/           shadcn/ui primitives
lib/classification.ts    Rule engine (status classification, trend, overall condition)
lib/validation.ts        Incoming sample validation
lib/workflow.ts          Assignment, suppression and workflow rules
lib/live-context.tsx     Live data provider, polling and simulation engine
lib/data.ts              Data access and authorised workflow calls
supabase/functions/      ingest-vitals edge function (hardware + simulation ingress)
supabase/migrations/     SQL schema, functions, RLS policies and seed data
tailwind.config.ts       Design tokens
tests/                   Rule-engine and workflow test suite
```

---

## Deployment

This project is configured for [Netlify](https://www.netlify.com/) with the
`@netlify/plugin-nextjs` plugin. `netlify.toml` handles the build command
(`npx next build`) and publish directory (`.next`).

To deploy:

1. Push the repository to GitHub.
2. Connect the repo to Netlify (or use the Netlify CLI).
3. Set the environment variables in the Netlify dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `CAREWATCH_NOTIFICATION_WEBHOOK_URL` (optional)
4. Deploy. Netlify runs `next build` automatically.

Any platform that supports Next.js (Vercel, etc.) will also work — just set the environment
variables and run `npm run build`.

---

## License

Released under the [MIT License](LICENSE).
