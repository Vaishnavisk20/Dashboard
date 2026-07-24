# Project Delivery Dashboard

Production-style Project Delivery and Go-Live Forecasting dashboard built in this workspace from the supplied CSV.

## Commands

```bash
npm install
npm run seed
npm run dev
npm run build
npm run lint
npm test
npm run import:projects -- "data/imports/projects-filtered-20260715-1505.csv" --full
```

Open the app at `http://127.0.0.1:4173`.

## Database

By default, the app uses JSON-backed local persistence in `data/db/`.

To use Supabase instead:

1. Create a Supabase project.
2. Run the SQL in `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Restart `npm run dev`.

When Supabase credentials are present, the backend reads and writes:

- `dashboard_projects`
- `dashboard_imports`

The frontend API contract does not change.

## Deployment

Recommended production setup:

- Node.js web service serving both `public/` and `/api/*`
- Supabase Postgres for persistence
- Basic Auth enabled with environment variables
- Health check pointed at `/api/health`

Required environment variables:

```bash
PORT=4173
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECTS_TABLE=dashboard_projects
SUPABASE_IMPORTS_TABLE=dashboard_imports
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=replace-with-a-long-random-password
```

Optional production controls:

```bash
SUPABASE_TIMEOUT_MS=10000
MAX_REQUEST_BYTES=2097152
```

Use local JSON only for development or demos:

```bash
SUPABASE_DISABLED=1 npm run dev
```

Production commands:

```bash
npm install
npm run build
npm start
```

The health endpoint is intentionally unauthenticated so hosting platforms can monitor it. All other routes are protected when both Basic Auth variables are set.

### Render Deployment

This repo includes `render.yaml` for Render Blueprint deployment.

1. Push the repo to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect `https://github.com/Vaishnavisk20/Dashboard`.
4. Render will read `render.yaml`.
5. Add the secret values when prompted:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BASIC_AUTH_USERNAME`
   - `BASIC_AUTH_PASSWORD`
6. Deploy.

After deployment, open `/api/health` on the Render URL to confirm the backend is running.

### Vercel Deployment

This repo includes `vercel.json` and an `api/index.js` serverless adapter for Vercel.

1. In Vercel, choose **Add New > Project**.
2. Import `https://github.com/Vaishnavisk20/Dashboard`.
3. Use the default framework setting or choose **Other**.
4. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_PROJECTS_TABLE=dashboard_projects`
   - `SUPABASE_IMPORTS_TABLE=dashboard_imports`
   - `SUPABASE_TIMEOUT_MS=10000`
   - `MAX_REQUEST_BYTES=2097152`
   - `BASIC_AUTH_USERNAME`
   - `BASIC_AUTH_PASSWORD`
5. Deploy.

Vercel serves `public/` as the frontend and routes `/api/*` to the Node serverless adapter. Check `/api/health` after deployment.

## CSV Import

The supplied CSV was copied to:

```text
data/imports/projects-filtered-20260715-1505.csv
```

CSV data is only used for import/refresh. KPI cards, charts, project tables, capacity, data quality, and forecast views read from backend APIs backed by stored project records.

In the app, use the Imports section to choose any customer CSV file from your machine, preview validation results, and then confirm the import. The default mode is **Replace current data**, so each uploaded customer CSV becomes the active dashboard dataset. Choose **Merge with current data** only when you intentionally want to keep existing records and update/add rows from the new file.

The Imports section also includes:

- Clear Data: removes all stored project records so the workspace is ready for a new customer file.

## Routes

- Overview: `/#overview`
- Go-Live Forecast: `/#forecast`
- Portfolios: `/#projects`
- IC Workload: `/#capacity`
- Data Hub: `/#imports`
- Settings: `/#settings`

The selected forecast range is stored in the URL as `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
