# My Task Lists

A simple, spreadsheet-style daily task list web app with a progress dashboard, built to run cheaply on Azure App Service.

- **Excel-like task grid** — one row per task, a checkbox to mark it done, inline-editable time and title cells.
- **Tasks are organized per day** — pick a date, add tasks for that day. A time is optional; tasks without one just don't show a time.
- **Dashboard** — completion rate, tasks completed vs. created, a current streak counter, and a bar chart of daily completion % over the last 7/14/30/90 days.
- **Password-protected** — single shared password, session-cookie based, since the app is reachable on a public URL.
- **Cheap to run** — Node.js + Express serving a static frontend (no build step, no separate hosting), with data stored in Azure Table Storage, which for personal-scale usage costs a few cents a month.

---

## Table of contents

1. [Architecture](#architecture)
2. [Project structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Local development](#local-development)
5. [Environment variables](#environment-variables)
6. [Deploying to Azure](#deploying-to-azure)
7. [Cost estimate](#cost-estimate)
8. [Security notes](#security-notes)
9. [Troubleshooting](#troubleshooting)
10. [Possible future improvements](#possible-future-improvements)

---

## Architecture

```
Browser (vanilla HTML/CSS/JS, Chart.js from CDN for the dashboard chart)
      │  HTTPS
      ▼
Azure App Service (Linux, Node.js)
  Express server
    - serves the static frontend from /public
    - session-cookie auth (single shared password)
    - REST API: /api/tasks, /api/dashboard
      │
      ▼
Azure Storage Account → Table Storage ("Tasks" table)
```

- **Backend**: Node.js + Express. No React/build step — the frontend is plain HTML/CSS/JS served directly from `/public`, which keeps the app small and avoids needing a build pipeline in the deployment.
- **Data store**: [Azure Table Storage](https://learn.microsoft.com/azure/storage/tables/table-storage-overview) — a NoSQL key-value store that's part of a regular Storage Account. It's the cheapest persistent data option on Azure (fractions of a cent per month at this scale), fully managed, and requires no server/database to patch or size.
  - `PartitionKey` = the task's date (`YYYY-MM-DD`), `RowKey` = a unique task ID. This lets the app fetch "all tasks for a day" or "all tasks in a date range" (for the dashboard) as a single efficient query.
- **Auth**: one shared password (set via an environment variable), checked against a login form, backed by a signed session cookie (`express-session`). Login attempts are rate-limited.

## Project structure

```
.
├── server.js                # App entrypoint: express setup, sessions, routing
├── src/
│   ├── auth.js               # requireAuth / requireAuthPage middleware
│   ├── storage.js            # Azure Table Storage access layer
│   └── routes/
│       ├── auth.js           # POST /api/login, /api/logout, GET /api/session
│       ├── tasks.js          # CRUD for tasks (per day)
│       └── dashboard.js      # GET /api/dashboard — aggregated stats
├── public/
│   ├── login.html / js/login.js
│   ├── index.html / js/app.js         # Excel-style daily task grid
│   ├── dashboard.html / js/dashboard.js
│   ├── js/common.js          # shared nav bar + fetch helper
│   └── css/style.css
├── .github/workflows/azure-deploy.yml # optional CI/CD via GitHub Actions
├── .env.example
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- An Azure subscription (a [free account](https://azure.microsoft.com/free/) works fine to get started)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (for deployment)
- Optional, for local development without touching real Azure resources: [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (installed as a dev dependency)

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy the example environment file and fill in a password/secret
cp .env.example .env

# 3. In one terminal, start the local Azure Storage emulator (Azurite)
npm run storage:emulator

# 4. In another terminal, start the app (auto-restarts on file changes)
npm run dev
```

Then open **http://localhost:8080**, sign in with the `APP_PASSWORD` you set in `.env`, and start adding tasks.

Azurite emulates Azure Table Storage locally, so nothing is created in your real Azure account until you deploy and point the app at a real connection string.

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Port the server listens on (App Service sets this automatically in production) | `8080` |
| `NODE_ENV` | `production` enables secure (HTTPS-only) session cookies | `production` |
| `APP_PASSWORD` | The shared password used to sign in | a long random string |
| `SESSION_SECRET` | Secret used to sign session cookies — generate with `openssl rand -hex 32` | random hex string |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for your Storage Account. Use `UseDevelopmentStorage=true` for local Azurite | see [Deploying to Azure](#deploying-to-azure) |
| `AZURE_TABLE_NAME` | Name of the table used to store tasks (auto-created on startup) | `Tasks` |

In Azure, set these under **App Service → Configuration → Application settings** rather than committing a `.env` file.

## Deploying to Azure

These steps use the Azure CLI and provision the cheapest reasonable setup: a **Basic (B1)** Linux App Service plan (~$13/month, supports "Always On" so the app doesn't cold-start) and a **Standard LRS Storage Account** (Table Storage — a few cents/month at personal-task-list scale). If you just want to try it out, you can substitute the **Free (F1)** plan — see the note after the commands.

```bash
# Variables — adjust as you like
RESOURCE_GROUP="task-list-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="tasklistdata$RANDOM"   # must be globally unique, lowercase, no dashes
APP_PLAN="task-list-plan"
APP_NAME="my-task-lists-$RANDOM"        # must be globally unique — this becomes <name>.azurewebsites.net

# 1. Resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 2. Storage account (for Table Storage)
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

# Grab the connection string — you'll need it below
STORAGE_CONN=$(az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString -o tsv)

# 3. App Service plan (Linux, Basic B1 — cheapest tier with Always On)
az appservice plan create \
  --name $APP_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# 4. Web app, Node 20 runtime
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_PLAN \
  --runtime "NODE:20-lts"

# 5. App settings (secrets/config)
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    NODE_ENV=production \
    APP_PASSWORD="choose-a-strong-password" \
    SESSION_SECRET="$(openssl rand -hex 32)" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    AZURE_TABLE_NAME="Tasks" \
    WEBSITE_RUN_FROM_PACKAGE=1

# 6. Make sure the app is always running (not available on the Free tier)
az webapp config set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --always-on true

# 7. Deploy the code (zip deploy)
zip -r deploy.zip . -x "node_modules/*" ".git/*" ".azurite/*"
az webapp deploy \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src-path deploy.zip \
  --type zip
```

Your app will be live at `https://<APP_NAME>.azurewebsites.net`.

**Using the Free (F1) tier instead:** replace `--sku B1` with `--sku F1` in step 3. The Free tier has no cost but doesn't support "Always On" (skip step 6), gives you 60 CPU-minutes/day, and the app may idle and cold-start after inactivity. It's fine for trying things out, but for daily real use B1 is worth the ~$13/month for reliability.

**Redeploying after code changes:**

```bash
zip -r deploy.zip . -x "node_modules/*" ".git/*" ".azurite/*"
az webapp deploy --name $APP_NAME --resource-group $RESOURCE_GROUP --src-path deploy.zip --type zip
```

**Optional: GitHub Actions CI/CD** — `.github/workflows/azure-deploy.yml` is included. Download the publish profile (`az webapp deployment list-publishing-profiles --name $APP_NAME --resource-group $RESOURCE_GROUP --xml`), add it as a GitHub secret named `AZURE_WEBAPP_PUBLISH_PROFILE`, set `AZURE_WEBAPP_NAME` in the workflow file, and push to `main` to auto-deploy.

## Cost estimate

| Resource | Tier | Approx. cost |
|---|---|---|
| App Service Plan | B1 (Basic, Linux) | ~$13/month |
| App Service Plan | F1 (Free, Linux) | $0/month (limited CPU quota, no Always On) |
| Storage Account (Table Storage) | Standard LRS | ~$0.05/GB/month + ~$0.0004 per 10,000 transactions — for a single-user daily task list this is typically **a few cents a month** |

So a realistic total is **~$13/month** on B1 (mainly the compute), or **effectively free** on F1 if occasional cold starts are acceptable. Table Storage costs are negligible either way — you'd have to store an enormous number of tasks to notice it on a bill.

## Security notes

- The app is protected by a single shared password (`APP_PASSWORD`) and a signed, `httpOnly`, `secure` (in production) session cookie. There's no per-user account system — treat it as a personal tool, not a multi-tenant app.
- Login attempts are rate-limited (10 per 15 minutes per IP) to slow down brute-forcing.
- `SESSION_SECRET` and `APP_PASSWORD` should be long, random values in production — never reuse the placeholder values from `.env.example`.
- Sessions are kept in memory in the Node process. This is fine as long as the App Service plan runs a single instance (true by default on B1/F1). If you ever scale out to multiple instances, sessions won't be shared across them and you'd need a shared session store (e.g. Redis) — not needed at this app's scale.
- All traffic to `*.azurewebsites.net` is HTTPS by default.

## Troubleshooting

- **"Server is missing APP_PASSWORD configuration"** — the `APP_PASSWORD` app setting isn't set. Check App Service → Configuration → Application settings.
- **App won't start / shows the default Azure placeholder page** — check **Log stream** in the Azure Portal (App Service → Monitoring → Log stream) for startup errors, and confirm the Node runtime version matches `engines.node` in `package.json`.
- **Tasks don't save / 500 errors from `/api/tasks`** — usually means `AZURE_STORAGE_CONNECTION_STRING` is missing or wrong. Double-check it was copied from the correct Storage Account.
- **Cold starts on the Free (F1) tier** — expected; upgrade to B1 and enable Always On if this is a problem.

## Possible future improvements

- Recurring/repeating tasks (e.g. "every weekday")
- Multiple named lists or categories/tags per task
- Export to CSV/Excel
- Per-user accounts instead of a single shared password
