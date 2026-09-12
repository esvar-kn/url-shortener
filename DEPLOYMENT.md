# ☁️ Railway Deployment Guide — SnapURL URL Shortener & Analytics

This guide provides step-by-step instructions for deploying **SnapURL** to [Railway](https://railway.app) with dedicated **PostgreSQL** and **Redis** database instances.

---

## 🏗️ Deployment Architecture

SnapURL is configured for unified single-container deployment using Railway's Nixpacks build system:

```
                           Railway Project Canvas
┌─────────────────────────────────────────────────────────────────────────────┐
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐│
│   Express App        │   │   PostgreSQL DB      │   │   Redis Database     ││
│ (Node.js Container)  │   │  (Relational Store)  │   │  (Cache + LPUSH Q)   ││
│                      │   │                      │   │                      ││
│ - Serves UI (SPA)    │   │ - Stores URLs        │   │ - Redirect Caching   ││
│ - REST API Endpoints │──►│ - Stores Clicks      │   │ - Async Click Queue  ││
│ - Background Worker  │   │                      │   │                      ││
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

Before starting, ensure you have:
1. A **GitHub account** with access to the repo: `https://github.com/esvar-kn/url-shortener.git`
2. A **Railway account** ([railway.app](https://railway.app))

---

## 🚀 Step-by-Step Railway Deployment Process

### Step 1: Create a New Project on Railway
1. Log in to your [Railway Dashboard](https://railway.app/dashboard).
2. Click **+ New Project**.
3. Select **Deploy from GitHub repo**.
4. Search for and select your `url-shortener` repository (`esvar-kn/url-shortener`).

---

### Step 2: Provision Database Services

In your Railway project canvas:

#### A. Add PostgreSQL Database:
1. Click **+ New** $\rightarrow$ **Database** $\rightarrow$ **Add PostgreSQL**.
2. Railway will automatically create a PostgreSQL service.

#### B. Add Redis Database:
1. Click **+ New** $\rightarrow$ **Database** $\rightarrow$ **Add Redis**.
2. Railway will automatically create a Redis instance.

---

### Step 3: Configure Environment Variables

1. Click on your **Express App / Service** node in the canvas.
2. Select the **Variables** tab.
3. Add the following environment variables (using Railway variable references):

| Variable Name | Value / Reference | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Connects app to Railway PostgreSQL database |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Connects app to Railway Redis instance |
| `NODE_ENV` | `production` | Enables production error handling & optimization |
| `CACHE_TTL_SECONDS` | `86400` | Redis redirect cache TTL (24 hours) |

---

### Step 4: Verify Deployment Configuration (`railway.json`)

Ensure `railway.json` is present in your repo root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

* **`buildCommand` (`npm run build`):** Runs `prisma generate` during image build phase to compile `@prisma/client` without requiring live database access.
* **`startCommand` (`npm start`):** Runs `prisma db push && node src/server.js` at container boot when `DATABASE_URL` is fully injected and accessible, applying database migrations before launching the REST server and background analytics worker.

---

### Step 5: Generate Public HTTPS Domain

1. In your Express service settings, select the **Settings** tab.
2. Under **Networking**, click **Generate Domain**.
3. Railway will generate a public HTTPS URL (e.g., `https://url-shortener-production.up.railway.app`).

---

## 🧪 Step 6: End-to-End Deployed Verification Flow

Once your service status changes to **Active (Green)**, verify all operations end-to-end:

### 1. Health Check
```bash
curl -i https://YOUR-RAILWAY-APP.up.railway.app/health
```
**Expected Response:** `200 OK`
```json
{
  "status": "OK",
  "service": "url-shortener",
  "timestamp": "2026-09-12T15:00:00.000Z"
}
```

---

### 2. Create Short URL via Deployed API
```bash
curl -i -X POST https://YOUR-RAILWAY-APP.up.railway.app/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"longUrl": "https://news.ycombinator.com", "customAlias": "hn-prod"}'
```
**Expected Response:** `201 Created`
```json
{
  "shortCode": "hn-prod",
  "shortUrl": "https://YOUR-RAILWAY-APP.up.railway.app/hn-prod",
  "longUrl": "https://news.ycombinator.com"
}
```

---

### 3. Test Deployed 302 Redirection & Redis Caching
* **First Request (Cache Miss — Queries DB & Populates Redis):**
```bash
curl -i https://YOUR-RAILWAY-APP.up.railway.app/hn-prod
```
**Expected Headers:**
- Status: `302 Found`
- `Location: https://news.ycombinator.com`
- `X-Cache: MISS`

* **Second Request (Cache Hit — Served directly from Redis memory):**
```bash
curl -i https://YOUR-RAILWAY-APP.up.railway.app/hn-prod
```
**Expected Headers:**
- Status: `302 Found`
- `Location: https://news.ycombinator.com`
- `X-Cache: HIT`

---

### 4. Verify Asynchronous Analytics Persistence
Wait 1–2 seconds for the background worker to process queue events, then query stats:

```bash
curl -i https://YOUR-RAILWAY-APP.up.railway.app/api/urls/hn-prod/stats
```
**Expected Response:** `200 OK`
```json
{
  "shortCode": "hn-prod",
  "clickCount": 2,
  "dailyBreakdown": [
    { "date": "2026-09-12", "count": 2 }
  ]
}
```

---

### 5. Verify Full Dashboard UI
Visit `https://YOUR-RAILWAY-APP.up.railway.app` in your web browser. Test link creation, copy to clipboard, 1-click test redirect, and chart rendering!
