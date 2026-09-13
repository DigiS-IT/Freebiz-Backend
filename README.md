# FreeBiz Backend API

> **Free & Discounted Service Marketplace** — Production & MVP Backend Service.

The FreeBiz Backend is a Node.js + Express + TypeScript REST API powering both the **FreeBiz Flutter Mobile Application** (for customers and on-site staff) and the **FreeBiz Web Portals** (for Service Providers and Super Admins).

---

## Quick Links
- 📖 **[Comprehensive API Reference & Documentation](./API_DOCUMENTATION.md)** — Detailed specification of all routes, request bodies, query parameters, schemas, and responses.
- 🗄️ **Database Schema:** [`prisma/schema.prisma`](./prisma/schema.prisma)
- ⚙️ **Configuration:** [`.env.example`](./.env.example)

---

## Tech Stack
- **Runtime:** Node.js 18 LTS+
- **Language:** TypeScript 5.4
- **Web Framework:** Express.js 4.19
- **ORM & Database:** Prisma 5.14 with PostgreSQL 15+ (AWS RDS with PostGIS extension support)
- **Object Storage:** AWS S3 SDK v3 (for service photos, business logos, and customer profiles)
- **Auth & Security:** JWT (Access & Refresh), Bcrypt, Helmet, CORS, Zod validation
- **Integrations:** Firebase Admin SDK (Phone auth), Twilio SMS, Nodemailer (Magic links & renewal reminders)
- **QR Code Engine:** `qrcode` generating branded QR codes for on-site voucher redemptions

---

## Getting Started

### 1. Installation & Environment Setup
```bash
# Clone the repository and navigate to backend directory
cd Freebiz-Backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### 2. Database Migration & Prisma
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply migrations
npm run prisma:migrate

# Seed database with sample data
npm run prisma:seed
```

### 3. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000` with the API root mounted at `http://localhost:3000/api/v1`.

---

## Default & Testing Credentials

### Web Portal Accounts
| Role | Identifier / Phone | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `jayasimmacse` or `9999999999` | `Admin@123` | Platform-wide control, demographic insights, SP management |
| **SP Super Admin** | `8888888888` | `Sp@12345` | Business owner web portal, service & slot management, staff administration |

### Test Phone Numbers (SMS Bypass)
The following numbers automatically accept OTP **`123456`**:
`9999999999`, `1234567890`, `0000000000`, `8888888888`, `8248387253`, `9159387253`, `9159384606`

---

## Core Features & Architecture Rules

1. **"One Service. One Slot."**:
   - Each service can have exactly one active slot date range (`fromDate` to `toDate`) with a configured `dailyCount`.
2. **Customer Daily Booking Limit**:
   - Each customer is strictly limited to a **maximum of 2 bookings per calendar day** across the platform.
3. **Geo-Spatial Radius Discovery**:
   - Customer service browsing calculates distance using PostgreSQL PostGIS (`ST_DistanceSphere`) within a 10 km default radius, falling back automatically to the Haversine formula.
4. **On-Site QR Redemption**:
   - Customer app receives a branded QR code with unique booking code `FB-YYYYMMDD-XXXX`.
   - On-site staff scan via mobile app (`/api/v1/qr/validate`) and redeem (`/api/v1/qr/use`) on the day of service.
5. **Role Restrictions**:
   - `MOBILE_SP` (staff accounts) are restricted from logging in via the web portal (`source: 'web'`).
6. **Background Automation**:
   - Hourly cron job automatically marks unredeemed bookings as `EXPIRED` once the booking date passes.
   - Daily cron job automatically updates expired subscription records.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start development server with Nodemon hot-reloading |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm run start` | Run compiled production build from `dist/app.js` |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Launch visual database manager in browser |
| `npm run prisma:seed` | Seed initial database state |
| `npm run create-superadmin` | Create or update Super Admin account via CLI |
| `npm run remove-default-sp` | Remove default template Service Provider |
