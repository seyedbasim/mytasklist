# My Task Lists

A simple, spreadsheet-style daily task list web app with a progress dashboard, built to run cheaply on Azure App Service.

- **Excel-like task grid** — one row per task, a checkbox to mark it done, inline-editable time and title cells.
- **Tasks are organized per day** — pick a date, add tasks for that day. A time is optional; tasks without one just don't show a time.
- **Incomplete tasks roll over automatically** — anything left unchecked past its day moves forward to today the next time the app is opened, and keeps moving forward until it's completed. There's no scheduled job for this (which would need extra Azure resources); it runs lazily whenever the app loads.
- **Personal / Work toggle** — a separate task list, dashboard, and set of labels for each category; the toggle persists across page loads.
- **Colored labels** — define named, colored labels per category and filter the task grid by label.
- **Dashboard** — completion rate, tasks completed vs. created, a current streak counter, and a bar chart of daily completion % over the last 7/14/30/90 days.
- **Passkey sign-in** — Face ID / Touch ID via WebAuthn instead of a password. Register once and it syncs to your other Apple devices automatically through iCloud Keychain. Once a passkey exists, password sign-in disables itself — there's no brute-forceable credential left at all.
- **Cheap to run** — Node.js + Express serving a static frontend (no build step, no separate hosting), with data stored in Azure Table Storage, which for personal-scale usage costs a few cents a month.

---

## Table of contents

1. [Architecture](#architecture)
2. [Project structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Local development](#local-development)
5. [Environment variables](#environment-variables)
6. [Deploying to Azure](#deploying-to-azure)
7. [Custom domain & HTTPS](#custom-domain--https)
8. [Setting up passkey sign-in](#setting-up-passkey-sign-in)
9. [Cost estimate](#cost-estimate)
10. [Security notes](#security-notes)
11. [Troubleshooting](#troubleshooting)
12. [Possible future improvements](#possible-future-improvements)

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
    - REST API: /api/tasks, /api/dashboard, /api/labels, /api/webauthn
      │
      ▼
Azure Storage Account → Table Storage ("Tasks", "Labels", "Credentials" tables)
```

- **Backend**: Node.js + Express. No React/build step — the frontend is plain HTML/CSS/JS served directly from `/public`, which keeps the app small and avoids needing a build pipeline in the deployment.
- **Data store**: [Azure Table Storage](https://learn.microsoft.com/azure/storage/tables/table-storage-overview) — a NoSQL key-value store that's part of a regular Storage Account. It's the cheapest persistent data option on Azure (fractions of a cent per month at this scale), fully managed, and requires no server/database to patch or size.
  - **Tasks table**: `PartitionKey` = the task's date (`YYYY-MM-DD`), `RowKey` = a unique task ID, with `category` (`personal`/`work`) and `labelId` as properties. This lets the app fetch "all tasks for a day" or "all tasks in a date range" (for the dashboard) as a single efficient query, filtered by category.
  - **Labels table**: `PartitionKey` = category (`personal`/`work`), `RowKey` = a unique label ID, with `name` and `color` (hex) as properties — keeping personal and work labels completely separate.
  - **Credentials table**: one row per registered passkey — the WebAuthn credential ID, public key, signature counter, and a friendly label. Never contains a private key; that stays on your device's secure enclave.
- **Auth**: passkey (WebAuthn) sign-in via [`@simplewebauthn`](https://simplewebauthn.dev/) — free, open-source, no third-party identity service. A shared password exists only for the initial bootstrap (registering your first passkey) and disables itself automatically the moment a passkey is registered. See [Setting up passkey sign-in](#setting-up-passkey-sign-in).

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
| `APP_PASSWORD` | The shared password used to sign in before a passkey is registered | a long random string |
| `SESSION_SECRET` | Secret used to sign session cookies — generate with `openssl rand -hex 32` | random hex string |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for your Storage Account. Use `UseDevelopmentStorage=true` for local Azurite | see [Deploying to Azure](#deploying-to-azure) |
| `AZURE_TABLE_NAME` | Name of the table used to store tasks (auto-created on startup) | `Tasks` |
| `AZURE_LABELS_TABLE_NAME` | Name of the table used to store label definitions (auto-created on startup) | `Labels` |
| `AZURE_CREDENTIALS_TABLE_NAME` | Name of the table used to store passkey credentials (auto-created on startup) | `Credentials` |
| `WEBAUTHN_RP_NAME` | Friendly name shown in the OS passkey picker | `Basim's Tasks` |
| `WEBAUTHN_RP_ID` | **Must exactly match the domain serving the app** (no `https://`, no path) | `tasks.seyedbasim.net` |
| `WEBAUTHN_ORIGIN` | **Must exactly match the full origin** the app is served from | `https://tasks.seyedbasim.net` |

In Azure, set these under **App Service → Configuration → Application settings** rather than committing a `.env` file.

## Deploying to Azure

These steps use the Azure CLI and provision the cheapest reasonable setup: a **Basic (B1)** Linux App Service plan (~$13/month, supports "Always On" so the app doesn't cold-start) and a **Standard LRS Storage Account** (Table Storage — a few cents/month at personal-task-list scale). If you just want to try it out, you can substitute the **Free (F1)** plan — see the note after the commands.

```bash
# Variables — adjust as you like
RESOURCE_GROUP="task-list-rg"
LOCATION="southeastasia"
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

# 4. Web app, Node 22 runtime
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_PLAN \
  --runtime "NODE:22-lts"

# 5. App settings (secrets/config)
# NOTE: replace the APP_PASSWORD value below with your own — don't deploy this literal placeholder.
# SCM_DO_BUILD_DURING_DEPLOYMENT=true tells Azure to run `npm install` on the server during deploy,
# since the zip we upload deliberately excludes node_modules.
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    NODE_ENV=production \
    APP_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)" \
    SESSION_SECRET="$(openssl rand -hex 32)" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
    AZURE_TABLE_NAME="Tasks" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true

# 6. Make sure the app is always running (not available on the Free tier)
az webapp config set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --always-on true

# 7. Deploy the code (zip deploy)
# Use `config-zip`, not `az webapp deploy --type zip` — the latter silently skips the build
# step ("Run-From-Zip") even with SCM_DO_BUILD_DURING_DEPLOYMENT set, which deploys a broken
# app with no node_modules and fails to start after a ~10 minute timeout.
zip -r deploy.zip . -x "node_modules/*" ".git/*" ".azurite/*" "deploy.zip"
az webapp deployment source config-zip \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src deploy.zip
```

Your app will be live at `https://<APP_NAME>.azurewebsites.net`. To retrieve the password you just generated: `az webapp config appsettings list --name $APP_NAME --resource-group $RESOURCE_GROUP --query "[?name=='APP_PASSWORD'].value" -o tsv`.

**Using the Free (F1) tier instead:** replace `--sku B1` with `--sku F1` in step 3. The Free tier has no cost but doesn't support "Always On" (skip step 6), gives you 60 CPU-minutes/day, and the app may idle and cold-start after inactivity. It's fine for trying things out, but for daily real use B1 is worth the ~$13/month for reliability.

**Redeploying after code changes:**

```bash
zip -r deploy.zip . -x "node_modules/*" ".git/*" ".azurite/*" "deploy.zip"
az webapp deployment source config-zip --name $APP_NAME --resource-group $RESOURCE_GROUP --src deploy.zip
```

If app settings changes (e.g. rotating `APP_PASSWORD`) don't seem to take effect immediately, run `az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP` — propagation to the running process can lag a few seconds to a minute behind the `appsettings set` call returning.

**Optional: GitHub Actions CI/CD** — `.github/workflows/azure-deploy.yml` is included. Download the publish profile (`az webapp deployment list-publishing-profiles --name $APP_NAME --resource-group $RESOURCE_GROUP --xml`), add it as a GitHub secret named `AZURE_WEBAPP_PUBLISH_PROFILE`, set `AZURE_WEBAPP_NAME` in the workflow file, and push to `main` to auto-deploy. If downloading the publish profile fails with a Basic Authentication error, see [Troubleshooting](#troubleshooting).

## Custom domain & HTTPS

App Service can front the app with your own domain and a **free, auto-renewing TLS certificate** (Azure's App Service Managed Certificate — issued by DigiCert, functionally equivalent to what you'd get from Let's Encrypt, but Azure handles renewal for you). This requires the Basic (B1) tier or higher; it's not available on Free (F1).

```bash
HOSTNAME="tasks.example.com"   # replace with your subdomain

# 1. Get the verification ID and default hostname you'll need for DNS records
az webapp show --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --query "{verificationId:customDomainVerificationId, defaultHostName:defaultHostName}" -o json
```

At your DNS provider, add two records for your domain (using the values from step 1):

| Type | Name | Value |
|---|---|---|
| TXT | `asuid.<subdomain>` | the `verificationId` from above |
| CNAME | `<subdomain>` | the `defaultHostName` from above (`<APP_NAME>.azurewebsites.net`) |

The TXT record proves you own the domain; the CNAME routes traffic to the app. Wait for DNS to propagate (`dig +short TXT asuid.$HOSTNAME` and `dig +short CNAME $HOSTNAME` should return the values above), then:

```bash
# 2. Bind the custom domain to the app
az webapp config hostname add \
  --webapp-name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --hostname $HOSTNAME

# 3. Issue the free managed certificate (can take a few minutes)
az webapp config ssl create \
  --hostname $HOSTNAME \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP
# Poll until it's ready:
az webapp config ssl show -g $RESOURCE_GROUP --certificate-name $HOSTNAME

# 4. Bind the certificate (grab the thumbprint from step 3's output)
az webapp config ssl bind \
  --certificate-thumbprint <THUMBPRINT> \
  --ssl-type SNI \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP

# 5. Force HTTPS (redirect any plain-HTTP requests)
az webapp update --name $APP_NAME --resource-group $RESOURCE_GROUP --https-only true
```

Note: right after binding, you may briefly get Azure's default wildcard certificate instead of yours on some requests — this is normal edge-fleet propagation lag and typically resolves within a few minutes. The managed certificate auto-renews before its ~6-month expiry as long as the CNAME and TXT records stay in place; no action needed.

If you specifically want a certificate issued by Let's Encrypt itself rather than Azure's managed certificate, you'd instead run `certbot` with a DNS-01 challenge against your provider, convert the resulting `fullchain.pem`/`privkey.pem` to a `.pfx` (`openssl pkcs12 -export ...`), and upload it with `az webapp config ssl upload` — but you'd then own renewing and re-uploading it every ~90 days, since App Service won't do that for a manually-uploaded certificate.

## Setting up passkey sign-in

The app ships with password auth so it's reachable on first deploy, then upgrades itself to passkey-only once you register one. **The passkey must be registered against the real domain it'll be used on** — WebAuthn cryptographically binds a passkey to the exact `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` it was created with, so these must be set to your real domain *before* you register, not left on the `localhost` defaults.

```bash
# 1. Point WebAuthn at your real domain (must match exactly, including https://)
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    WEBAUTHN_RP_ID="tasks.example.com" \
    WEBAUTHN_ORIGIN="https://tasks.example.com"
```

Then, in a browser on your Mac, iPad, or iPhone (Safari, or any browser with platform passkey support):

1. Sign in with the password.
2. Go to **Passkeys** in the nav bar.
3. Click **Add a passkey**, name it (e.g. "MacBook Pro"), and complete the Face ID/Touch ID prompt.

That's it — password sign-in disables itself automatically the moment that passkey is registered. If all your devices share the same iCloud account with iCloud Keychain sync turned on, this single passkey is usable from your Mac, iPad, and iPhone without registering again on each one.

**Recovery if you ever lose access to every device with the passkey**: there's no password fallback once a passkey exists, by design. To reset, delete the `Credentials` table from the Storage Account — the app recreates it empty on the next request, and password sign-in resumes automatically:

```bash
az storage table delete --name Credentials --account-name $STORAGE_ACCOUNT --account-key "$(az storage account keys list --account-name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --query '[0].value' -o tsv)"
```

Then sign in with `APP_PASSWORD` and register a new passkey as above.

## Cost estimate

| Resource | Tier | Approx. cost |
|---|---|---|
| App Service Plan | B1 (Basic, Linux) | ~$13/month |
| App Service Plan | F1 (Free, Linux) | $0/month (limited CPU quota, no Always On) |
| Storage Account (Table Storage) | Standard LRS | ~$0.05/GB/month + ~$0.0004 per 10,000 transactions — for a single-user daily task list this is typically **a few cents a month** |

So a realistic total is **~$13/month** on B1 (mainly the compute), or **effectively free** on F1 if occasional cold starts are acceptable. Table Storage costs are negligible either way — you'd have to store an enormous number of tasks to notice it on a bill.

## Security notes

- **Auth model**: passkey (WebAuthn) sign-in is the intended long-term state. `APP_PASSWORD` only matters before a passkey is registered — see [Setting up passkey sign-in](#setting-up-passkey-sign-in). Once a passkey exists, `POST /api/login` rejects every request regardless of password, closing off the brute-force surface entirely rather than just rate-limiting it.
- Login attempts (both password and passkey) are rate-limited (10 per 15 minutes per IP).
- Sessions are `httpOnly`, `secure` in production, and `SameSite=Strict` — a signed cookie via `express-session`, kept in memory in the Node process. This is fine as long as the App Service plan runs a single instance (true by default on B1/F1); scaling out to multiple instances would need a shared session store (e.g. Redis), not needed at this app's scale.
- A [Content-Security-Policy](https://developer.mozilla.org/docs/Web/HTTP/CSP) is enforced (`script-src 'self' https://cdn.jsdelivr.net`, no `unsafe-inline` anywhere) — the only external script sources are the Chart.js and SimpleWebAuthn CDN bundles.
- `SESSION_SECRET` and `APP_PASSWORD` should be long, random values — never reuse the placeholder values from `.env.example`.
- All traffic to `*.azurewebsites.net` and your custom domain is HTTPS by default (`httpsOnly` is enabled on the App Service).
- **If you ever paste secrets into a chat/terminal session that gets logged somewhere** (as happened a few times while building this), treat them as burned: rotate the Storage Account key (Portal → Storage Account → Access keys → Regenerate, then update `AZURE_STORAGE_CONNECTION_STRING`) and `SESSION_SECRET`.
- Run `npm audit` periodically and update dependencies — none of the flagged issues at time of writing were in a production code path, but it's worth checking after any `npm install`.

## Troubleshooting

- **"Server is missing APP_PASSWORD configuration"** — the `APP_PASSWORD` app setting isn't set. Check App Service → Configuration → Application settings.
- **App won't start / shows the default Azure placeholder page** — check **Log stream** in the Azure Portal (App Service → Monitoring → Log stream) for startup errors, and confirm the Node runtime version matches `engines.node` in `package.json`.
- **Tasks don't save / 500 errors from `/api/tasks`** — usually means `AZURE_STORAGE_CONNECTION_STRING` is missing or wrong. Double-check it was copied from the correct Storage Account.
- **"Deployment failed because the site failed to start within 10 mins" after a zip deploy** — you deployed with `az webapp deploy --type zip`, which (as of this writing) skips the Oryx build step entirely regardless of `SCM_DO_BUILD_DURING_DEPLOYMENT`, uploading a package with no `node_modules`. Use `az webapp deployment source config-zip` instead (see [Deploying to Azure](#deploying-to-azure)) — check `az webapp log deployment show -n <APP_NAME> -g <RESOURCE_GROUP>` for a `"Running oryx build..."` line to confirm the build actually ran.
- **Downloading the publish profile fails with a Basic Authentication error** — newer App Services disable SCM/FTP Basic Auth by default. Re-enable it under App Service → Configuration → General settings → "SCM Basic Auth Publishing Credentials" (and FTP if needed), or switch the GitHub Actions workflow to OIDC/federated credentials instead.
- **Changed an app setting (e.g. `APP_PASSWORD`) but the old value still seems active** — propagation to the running process can lag behind the `az webapp config appsettings set` call by anywhere from a few seconds to about a minute. Run `az webapp restart` and wait for `/api/session` to respond before retrying.
- **Cold starts on the Free (F1) tier** — expected; upgrade to B1 and enable Always On if this is a problem.
- **Passkey registration fails with a security/origin error** — `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` don't match the domain you're actually on. They must be exact: `WEBAUTHN_RP_ID` is just the hostname (`tasks.example.com`), `WEBAUTHN_ORIGIN` is the full origin including scheme (`https://tasks.example.com`). See [Setting up passkey sign-in](#setting-up-passkey-sign-in).
- **Locked out because every device with the passkey is gone** — see the recovery command in [Setting up passkey sign-in](#setting-up-passkey-sign-in); it clears stored passkeys and re-enables `APP_PASSWORD` sign-in.

## Possible future improvements

- Recurring/repeating tasks (e.g. "every weekday")
- Multiple named lists or categories/tags per task
- Export to CSV/Excel
- Per-user accounts instead of a single shared password
- Region-restricting sign-in to a specific country was tried and reverted — two different outbound geo-IP lookup services (ip-api.com, then ipinfo.io) both failed unreliably when called from this app's own Azure runtime, for reasons that resisted full diagnosis (one was shared-IP quota exhaustion; the other's cause was never fully confirmed, but was reproducible: worked for ~60s after each restart, then failed consistently). If revisited, the better approach is likely reading the `CF-IPCountry` header from a free Cloudflare proxy in front of the domain — no outbound call from the app at all, sidestepping whatever was wrong with outbound HTTPS from this specific environment.
