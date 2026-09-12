# ⚡ SnapURL — Enterprise-Grade URL Shortener & Analytics Platform

> A high-performance, scalable URL Shortening and Analytics service built with **Node.js**, **Express**, **PostgreSQL**, **Prisma ORM**, and **Redis**. Features Base62 encoding, sub-10ms Cache-Aside redirection, event-driven asynchronous click tracking, custom alias support, and a sleek full-stack dashboard.

---

## 🌟 Key Features

* 🚀 **Bijective Base62 Encoding:** Converts auto-incrementing integer IDs into deterministic, collision-free 5–6 character short codes (`0%` hash collision risk).
* 🎨 **Custom Alias Support:** Allows users to request personalized short links (e.g. `/my-custom-link`) with real-time database uniqueness checks.
* ⚡ **High-Speed Cache-Aside Redirection:** Serves hot URL redirects directly from **Redis** memory (`< 2ms` latency), bypassing Postgres read queries.
* 📩 **Asynchronous Click Analytics:** Offloads click tracking from the HTTP response path using a **Redis List Queue (`LPUSH` / `BRPOP`)** and a background worker thread (`analyticsWorker`).
* 📊 **Interactive Full-Stack Dashboard:** Built-in single-page frontend ([`public/index.html`](./public/index.html)) featuring glassmorphism design, 1-click clipboard copying, test redirects, and real-time daily click breakdown charts powered by **Chart.js**.
* 🛡️ **Production-Hardened Security:** Secured with **Helmet** Content-Security-Policy (CSP) headers, **Express Rate-Limiting** (30 creates / 15 mins per IP), Gzip payload compression, and operational error handling (`AppError`).

---

## 📐 System Architecture & Flow

```mermaid
graph TD
    Client[📱/💻 Client Browser] -->|POST /api/shorten| Gateway[🌐 API Server / Express]
    Client -->|GET /:shortCode| Gateway

    subgraph Write Path - URL Creation
        Gateway -->|1. Generate ID| DB[(🗄️ Postgres DB)]
        Gateway -->|2. Encode Base62| Shortener[Base62 Encoder]
        Gateway -->|3. Pre-Cache| Cache[(⚡ Redis Cache)]
    end

    subgraph Read Path - Low-Latency Redirection
        Gateway -->|1. Lookup| Cache
        Gateway -.->|2. Cache Miss Fallback| DB
        Gateway -->|3. Fast Path LPUSH| Queue[(📩 Redis Queue: click-events)]
    end

    subgraph Asynchronous Analytics Pipeline
        Queue -->|BRPOP Consume| Worker[⚡ Background Analytics Worker]
        Worker -->|Batch Increment & Click Entry| DB
    end
```

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description | Request Payload | Success Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/shorten` | Shorten a long URL *(Optional `customAlias`)* | `{ "longUrl": "https://example.com", "customAlias": "my-alias" }` | `201 Created` — `{ "shortCode": "my-alias", "shortUrl": "..." }` |
| `GET` | `/:shortCode` | Redirect short code to long URL | *None* | `302 Found` — Redirects to target URL (`X-Cache: HIT/MISS`) |
| `GET` | `/api/urls/:shortCode/stats` | Fetch total clicks & daily breakdown | *None* | `200 OK` — `{ "clickCount": 12, "dailyBreakdown": [...] }` |
| `GET` | `/health` | Service health check | *None* | `200 OK` — `{ "status": "OK", "timestamp": "..." }` |
| `GET` | `/encode/:id` | Test Base62 encoder for numeric ID | *None* | `200 OK` — `{ "id": 62, "shortCode": "BA" }` |

---

## 🗄️ Database Schema ([`prisma/schema.prisma`](./prisma/schema.prisma))

```prisma
model Url {
  id         Int      @id @default(autoincrement())
  shortCode  String?  @unique @map("short_code")
  longUrl    String   @map("long_url")
  createdAt  DateTime @default(now()) @map("created_at")
  clickCount Int      @default(0) @map("click_count")
  clicks     Click[]

  @@map("urls")
}

model Click {
  id        Int      @id @default(autoincrement())
  urlId     Int      @map("url_id")
  url       Url      @relation(fields: [urlId], references: [id], onDelete: Cascade)
  clickedAt DateTime @default(now()) @map("clicked_at")

  @@index([urlId])
  @@map("clicks")
}
```

---

## 🛠️ Tech Stack & Dependencies

* **Runtime & Framework:** Node.js, Express.js
* **Database & ORM:** PostgreSQL, Prisma ORM
* **Caching & Queueing:** Redis, ioredis
* **Security & Performance:** Helmet, Express Rate Limit, Compression, Morgan, Cors
* **Testing:** Supertest, Node Assert
* **Frontend:** HTML5, Vanilla CSS (Glassmorphism), JavaScript (ES6+), FontAwesome, Chart.js

---

## 🚀 Getting Started (Local Development)

### 1. Prerequisites
Ensure you have the following installed locally:
* **Node.js** `v18.x` or higher
* **PostgreSQL** running on port `5432`
* **Redis** running on port `6379` *(or Docker)*

### 2. Environment Setup
Clone the repository and install dependencies:

```bash
git clone https://github.com/esvar-kn/url-shortener.git
cd url-shortener
npm install
```

Create a `.env` file in the root directory:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:devpass@localhost:5432/url_shortener?schema=public"
REDIS_URL="redis://localhost:6379"
CACHE_TTL_SECONDS=86400
NODE_ENV=development
```

### 3. Database Sync & Code Generation
Generate the Prisma client and sync database schema:

```bash
npm run build
```

### 4. Run Development Server
Start the Express server & background worker concurrently:

```bash
npm run dev
```

Open your browser at [`http://localhost:3000`](http://localhost:3000) to access the full-stack UI dashboard!

---

## 🧪 Running Automated Tests

Run the complete unit and API integration test suite:

```bash
npm test
```

### Test Coverage Highlights:
- ✅ Base62 encoder/decoder mathematical precision tests
- ✅ Input validation & garbage URL rejection (`400 Bad Request`)
- ✅ Non-existent short code 404 error handling (`404 Not Found`)
- ✅ Custom alias creation & uniqueness collision handling (`409 Conflict`)
- ✅ Redis Cache-Aside verification (`X-Cache: MISS` on first hit, `X-Cache: HIT` on second hit)
- ✅ Async Analytics Worker verification (`BRPOP` queue consumption & database click updates)

---

## ☁️ Production Railway Deployment

The application is architected for unified single-container deployment on **Railway** with PostgreSQL and Redis:

1. Push code to GitHub: `https://github.com/esvar-kn/url-shortener`.
2. Connect your GitHub repository to [Railway.app](https://railway.app).
3. Provision **PostgreSQL** and **Redis** database services in your Railway project canvas.
4. Set environment variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - `NODE_ENV` = `production`
   - `CACHE_TTL_SECONDS` = `86400`
5. Railway automatically builds via [`railway.json`](./railway.json) (`prisma generate` during build, `prisma db push` on container boot) and serves both the static UI and API on a single live HTTPS domain.

For step-by-step verification commands, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 📖 System Design Documentation

For in-depth architectural details, refer to [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md):
* **Capacity Math:** QPS estimations, 5-year storage math (3 TB), 35 GB RAM caching estimations.
* **Data Layer Scaling:** Read Replicas vs. Database Sharding by `shortCode` using Consistent Hashing.
* **Eventual Consistency:** Replication lag tradeoffs and CDN Edge Caching strategies.
* **Message Broker Tradeoffs:** Comparison matrix between **Redis List Queues** vs. **Apache Kafka / RabbitMQ**.

---

## 📄 License

This project is open-source under the [ISC License](LICENSE).
