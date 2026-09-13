# FreeBiz Backend API - Comprehensive Technical Documentation

> **Version:** 1.0.0 (Phase 1 MVP)  
> **Base URL:** `http://localhost:3000/api/v1` (Default local development)  
> **Server Technology:** Node.js 18+, TypeScript 5.4, Express 4.19, Prisma 5.14, PostgreSQL 15+ (PostGIS enabled), AWS S3, Firebase Admin SDK.

---

## Table of Contents
1. [Architecture & Technology Stack](#1-architecture--technology-stack)
2. [Environment Configuration & Variables](#2-environment-configuration--variables)
3. [Database Schema & Data Models](#3-database-schema--data-models)
4. [Authentication & Authorization Matrix](#4-authentication--authorization-matrix)
5. [Standard Request & Response Conventions](#5-standard-request--response-conventions)
6. [API Endpoints Reference](#6-api-endpoints-reference)
   - [System & Health](#61-system--health)
   - [Locations & Master Data](#62-locations--master-data)
   - [Authentication & Identity](#63-authentication--identity)
   - [Customer Profile](#64-customer-profile)
   - [Services Management & Discovery](#65-services-management--discovery)
   - [Bookings Workflow](#66-bookings-workflow)
   - [QR Code Validation & Redemption](#67-qr-code-validation--redemption)
   - [Ratings & Reviews](#68-ratings--reviews)
   - [Service Provider (SP) Web Portal](#69-service-provider-sp-web-portal)
   - [Super Admin Control Panel](#610-super-admin-control-panel)
   - [File & Media Uploads](#611-file--media-uploads)
7. [Automated Background Jobs & Cron Tasks](#7-automated-background-jobs--cron-tasks)
8. [Setup, Migration, & CLI Utility Scripts](#8-setup-migration--cli-utility-scripts)

---

## 1. Architecture & Technology Stack

The FreeBiz Backend is a high-performance RESTful API service built for the Free & Discounted Service Marketplace.

```
┌──────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│  - Flutter Mobile App (Customers & MOBILE_SP Staff)          │
│  - React / Next.js Web Portals (SP Portal & Admin Dashboard) │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / JSON
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Express.js API Engine                       │
│  - Security: Helmet, CORS, Rate Limiting & Input Sanitization│
│  - Validation: Zod Schemas Middleware                        │
│  - Auth: JWT Bearer Tokens (HMAC SHA-256) & Bcrypt (12 rounds│
└──────────────┬───────────────┬────────────────┬──────────────┘
               │               │                │
               ▼               ▼                ▼
┌──────────────────┐  ┌────────────────┐  ┌────────────────────┐
│   PostgreSQL     │  │     AWS S3     │  │ External Services  │
│  (RDS + PostGIS) │  │  Photo & Video │  │ - Firebase Admin   │
│  Prisma ORM 5.14 │  │  Asset Storage │  │ - Twilio / SMS     │
└──────────────────┘  └────────────────┘  │ - Nodemailer (SMTP)│
                                          └────────────────────┘
```

- **Runtime & Language:** Node.js 18 LTS+, TypeScript 5.4.5 (`strict: true`)
- **Web Framework:** Express 4.19.2 with JSON & URL-encoded parsing (10 MB payload limit)
- **Database & ORM:** PostgreSQL 15+ hosted on AWS RDS via Prisma ORM 5.14.0
- **Geo-Spatial Querying:** Native PostGIS extension (`ST_DistanceSphere`) with automatic fallback to Haversine spherical distance calculations
- **Object Storage:** AWS S3 SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- **SMS & Phone Verification:** Twilio SDK + Firebase Admin SDK (token verification) + Test bypass mock numbers
- **Email Delivery:** Nodemailer with custom HTML templates for Magic Link logins and automated subscription reminders
- **QR Code Engine:** `qrcode` library generating PNGs with embedded FreeBiz visual branding and Base64 encoded payload

---

## 2. Environment Configuration & Variables

A sample `.env` file should be configured in the project root:

```env
# Server
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1

# Database (PostgreSQL with PostGIS support)
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<dbname>?schema=public

# Security & JWT Tokens
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret-key
JWT_REFRESH_EXPIRES_IN=30d

# SMS & Verification
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
OTP_EXPIRY_MINUTES=5

# Firebase Admin SDK (Alternative Phone Verification)
# Place service account JSON in src/config/freebiz-*-firebase-adminsdk-*.json

# AWS S3 Storage
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_S3_BUCKET_NAME=your-s3-bucket-name

# QR Code Secret
QR_CODE_SECRET=your-qr-code-validation-secret
QR_CODE_LOGO_PATH=./assets/freebiz-logo.png

# CORS & Web Origins
CORS_ORIGIN=http://localhost:3001,http://localhost:3002
FRONTEND_URL=http://localhost:3001

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-email@example.com
SMTP_PASS=your-smtp-app-password
```

---

## 3. Database Schema & Data Models

### Enums
- **`UserRole`**: `CUSTOMER`, `SP_SUPER_ADMIN`, `MOBILE_SP`, `SUPER_ADMIN`
- **`ServiceType`**: `FREE`, `DISCOUNTED`
- **`ServiceMode`**: `IN_PERSON`, `ONLINE` (Default: `IN_PERSON`)
- **`BookingStatus`**: `BOOKED`, `USED`, `EXPIRED`, `CANCELLED`, `REJECTED`
- **`SubscriptionStatus`**: `ACTIVE`, `EXPIRED`
- **`MediaType`**: `PHOTO`, `VIDEO`
- **`OtpPurpose`**: `LOGIN`, `VERIFICATION`

### Core Models & Relationships

| Model | Description | Key Fields & Constraints |
| :--- | :--- | :--- |
| **`User`** | System account record for all roles. | `phone` (unique), `email` (unique), `password` (hashed), `role`, `isActive`, `mustChangePassword`, `magicToken`, `serviceProviderId` (FK) |
| **`Otp`** | One-time password tracking. | `phone`, `code`, `purpose`, `isVerified`, `expiresAt` |
| **`CustomerProfile`** | User details for customers. | `userId` (FK unique), `name`, `age`, `gender`, `address`, `city`, `state`, `latitude`, `longitude`, `isProfileComplete` |
| **`SuperAdminProfile`**| Profile for platform administrators. | `userId` (FK unique), `name` |
| **`ServiceProviderProfile`** | Business profile for service provider organizations. | `businessName`, `businessEmail`, `profilePic`, `primaryContact`, `secondaryContact`, `address`, `city`, `latitude`, `longitude`, `isDisabled` |
| **`Service`** | Free or discounted service offerings. | `serviceProviderId` (FK), `serviceType`, `serviceDetail`, `actualPrice`, `discountedPrice`, `discountPercentage`, `contactNumber`, `address`, `city`, `latitude`, `longitude`, `specialInstructions`, `termsAndConditions`, `parentId` (self-relation for sub-services), `isActive`, `isDeleted` |
| **`ServiceMedia`** | Media assets linked to a service. | `serviceId` (FK), `mediaType` (PHOTO/VIDEO), `mediaUrl`, `thumbnailUrl`, `order` |
| **`ServiceSlot`** | Availability dates & quota ("One service. One slot."). | `serviceId` (FK), `startDate`, `endDate`, `dailyCount`, `totalCount`, `isActive`, `isDeleted` |
| **`Booking`** | Customer appointment or voucher. | `bookingCode` (`FB-YYYYMMDD-XXXX`), `customerId` (FK), `serviceId` (FK), `slotId` (FK), `bookingDate`, `status`, `cancellationReason`, `rejectionReason`, `usedAt`, `cancelledAt` |
| **`QRCode`** | Encrypted QR record for redemptions. | `bookingId` (FK unique), `qrData`, `qrImageUrl`, `isUsed`, `scannedAt`, `scannedByUserId` |
| **`Rating`** | 1–5 star reviews for redeemed (`USED`) bookings. | `bookingId` (FK unique), `customerId` (FK), `stars`, `review` |
| **`Subscription`** | Service provider subscription period. | `serviceProviderId` (FK), `startDate`, `endDate`, `status` |
| **`AuditLog`** | Change events audit trail. | `userId`, `action`, `entity`, `entityId`, `oldValue`, `newValue` |

---

## 4. Authentication & Authorization Matrix

Authentication is transmitted via HTTP Authorization header:
```http
Authorization: Bearer <ACCESS_TOKEN>
```

### Role Access Breakdown

| Endpoint Area | Allowed Roles | Middleware Required | Notes |
| :--- | :--- | :--- | :--- |
| **Customer App** | `CUSTOMER` | `authenticate`, `customerOnly` | OTP phone verification or Firebase token. Max 2 bookings/day. |
| **SP Web Portal** | `SP_SUPER_ADMIN` | `authenticate`, `spSuperAdminOnly` | Portal access blocked for `MOBILE_SP`. Requires active subscription. |
| **SP Mobile App** | `SP_SUPER_ADMIN`, `MOBILE_SP` | `authenticate`, `spOnly` | Used by on-site staff for QR scanning & redemption. |
| **Super Admin Panel** | `SUPER_ADMIN` | `authenticate`, `superAdminOnly` | Full platform control, revenue, subscription management. |
| **Public Endpoints** | Anyone | *None* (or `optionalAuthenticate`) | Service browsing, location lookups, health checks. |

### Mock Phone Numbers for Development
The following test phone numbers bypass SMS sending and automatically accept **`123456`** as the valid OTP:
- `9999999999`
- `1234567890`
- `0000000000`
- `8888888888`
- `8248387253`
- `9159387253`
- `9159384606`

---

## 5. Standard Request & Response Conventions

### Success Response Envelope
```json
{
  "success": true,
  "message": "Operation description (optional)",
  "data": { ... }
}
```

### Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Detailed error description",
    "details": null
  }
}
```

### Common HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Input validation failed or business rule violation.
- `401 Unauthorized`: Missing or invalid Bearer token / credentials.
- `403 Forbidden`: Token valid, but user role or subscription prohibits action.
- `404 Not Found`: Target entity or route does not exist.
- `500 Internal Server Error`: Unhandled server exception.

---

## 6. API Endpoints Reference

### 6.1 System & Health

#### `GET /health`
- **Auth:** None
- **Response:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-09-13T16:00:00.000Z",
    "environment": "development"
  }
  ```

#### `GET /api/v1/`
- **Auth:** None
- **Response:**
  ```json
  {
    "status": "healthy",
    "message": "FreeBiz API v1 is running",
    "timestamp": "2026-09-13T16:00:00.000Z"
  }
  ```

---

### 6.2 Locations & Master Data

#### `GET /api/v1/locations/india`
Returns master list of 24+ Indian states, prominent cities, and default map coordinates.
- **Auth:** None
- **Response:**
  ```json
  {
    "country": "India",
    "defaultLocation": {
      "country": "India",
      "state": "Tamil Nadu",
      "city": "Chennai",
      "latitude": 13.0827,
      "longitude": 80.2707
    },
    "states": ["Andhra Pradesh", "Karnataka", "Tamil Nadu", ...],
    "stateCityMap": {
      "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", ...]
    }
  }
  ```

---

### 6.3 Authentication & Identity

#### `POST /api/v1/auth/customer/send-otp`
Sends 6-digit numeric OTP via SMS (or seeds OTP record for test numbers).
- **Auth:** None
- **Body:**
  ```json
  {
    "phone": "9876543210"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "OTP sent successfully",
    "data": { "phone": "9876543210" }
  }
  ```

#### `POST /api/v1/auth/customer/verify-otp`
Verifies OTP code or Firebase ID token. Creates customer user and profile on first login.
- **Auth:** None
- **Body (Standard OTP):**
  ```json
  {
    "phone": "9876543210",
    "otp": "123456",
    "name": "Arun Kumar",
    "age": "28",
    "gender": "Male"
  }
  ```
- **Body (Firebase Token Alternative):**
  ```json
  {
    "phone": "9876543210",
    "otp": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
    "name": "Arun Kumar"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "uuid-v4",
        "phone": "9876543210",
        "role": "CUSTOMER",
        "profile": {
          "id": "uuid-v4",
          "name": "Arun Kumar",
          "age": 28,
          "gender": "Male"
        }
      },
      "accessToken": "jwt.access.token",
      "refreshToken": "jwt.refresh.token"
    }
  }
  ```

#### `POST /api/v1/auth/login`
Service Provider and Super Admin username/password authentication. Supports login via Phone, User ID, Email, or Business Name.
- **Auth:** None
- **Body:**
  ```json
  {
    "userId": "9999999999",
    "password": "Admin@123",
    "source": "web"
  }
  ```
- **Notes:** If `source: "web"` is sent and the account is `MOBILE_SP`, access is denied with status 403.
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "uuid-v4",
        "phone": "9999999999",
        "role": "SP_SUPER_ADMIN",
        "mustChangePassword": false,
        "serviceProviderId": "uuid-v4",
        "businessName": "Apex Salon & Spa",
        "isDisabled": false
      },
      "accessToken": "jwt.access.token",
      "refreshToken": "jwt.refresh.token"
    }
  }
  ```

#### `POST /api/v1/auth/magic-login`
Sends a 15-minute one-click login link to registered Service Provider or Admin email.
- **Auth:** None
- **Body:**
  ```json
  {
    "email": "owner@apexsalon.com"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Magic link sent successfully. Please check your inbox."
  }
  ```

#### `POST /api/v1/auth/magic-verify`
Verifies magic link token and authenticates the user.
- **Auth:** None
- **Body:**
  ```json
  {
    "token": "469143890f5b902..."
  }
  ```
- **Response (200):** Same user & token payload as `/auth/login`.

#### `POST /api/v1/auth/change-password`
Changes user password. Required when `mustChangePassword` is `true`.
- **Auth:** Required (`authenticate`)
- **Body:**
  ```json
  {
    "currentPassword": "OldPassword@123",
    "newPassword": "NewSecurePassword@123",
    "confirmPassword": "NewSecurePassword@123"
  }
  ```
- **Password Constraints:** At least 8 characters, 1 uppercase letter, 1 number, 1 special character (`!@#$%&*~`).

#### `POST /api/v1/auth/refresh-token`
Generates a new access token using a valid refresh token.
- **Auth:** None
- **Body:**
  ```json
  {
    "refreshToken": "jwt.refresh.token"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "new.jwt.access.token",
      "refreshToken": "new.jwt.refresh.token"
    }
  }
  ```

#### `GET /api/v1/auth/me`
Retrieves authenticated user session and role-specific profile details.
- **Auth:** Required (`authenticate`)

#### `POST /api/v1/auth/logout`
Terminates user session client-side.
- **Auth:** Required (`authenticate`)

---

### 6.4 Customer Profile

#### `GET /api/v1/customer/profile`
- **Auth:** Customer (`customerOnly`)
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid-v4",
      "userId": "uuid-v4",
      "name": "Arun Kumar",
      "age": 28,
      "gender": "Male",
      "profilePicture": "https://s3.aws.../profile.jpg",
      "address": "12 Anna Salai",
      "city": "Chennai",
      "state": "Tamil Nadu",
      "latitude": 13.0827,
      "longitude": 80.2707,
      "isProfileComplete": true,
      "user": {
        "phone": "9876543210",
        "lastLoginAt": "2026-09-13T10:00:00.000Z"
      }
    }
  }
  ```

#### `PATCH /api/v1/customer/profile`
Upserts customer profile details and automatically marks `isProfileComplete: true`.
- **Auth:** Customer (`customerOnly`)
- **Body:**
  ```json
  {
    "name": "Arun Kumar",
    "age": 29,
    "gender": "Male",
    "address": "45 Cathedral Road",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "latitude": 13.0456,
    "longitude": 80.2543
  }
  ```

---

### 6.5 Services Management & Discovery

#### `GET /api/v1/services`
Public discovery endpoint for in-person services. Calculates spatial distance via PostGIS with automatic fallback to Haversine formula.
- **Auth:** None (public)
- **Query Parameters:**
  - `serviceType`: `FREE` | `DISCOUNTED` (optional)
  - `minDiscount`: Minimum discount percentage (e.g. `50`)
  - `maxDiscount`: Maximum discount percentage (e.g. `90`)
  - `maxDistance`: Max distance in meters (default: `10000` = 10km)
  - `city`: Case-insensitive city filter (e.g. `Chennai`)
  - `latitude`, `longitude`: User location coordinates
  - `search`: Searches provider business name, address, or city
  - `page`: Page index (default: `1`)
  - `limit`: Items per page (default: `20`, max: `100`)
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "services": [
        {
          "id": "uuid-v4",
          "businessName": "Apex Salon & Spa",
          "serviceType": "FREE",
          "serviceDetail": "Free Haircut & Styling Session",
          "contactNumber": "9876543210",
          "address": "12 Velachery Main Rd",
          "city": "Chennai",
          "latitude": 12.9815,
          "longitude": 80.2180,
          "specialInstructions": "Please arrive 10 mins prior.",
          "termsAndConditions": "Valid once per customer.",
          "actualPrice": null,
          "discountedPrice": null,
          "discountPercentage": null,
          "discountTier": null,
          "thumbnailUrl": "https://s3.../photo1.jpg",
          "distance": 3.42,
          "distanceText": "3.4 km",
          "hasActiveSlot": true,
          "availableToday": 5,
          "subServices": []
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "pages": 1
      }
    }
  }
  ```

#### `GET /api/v1/services/home/categories`
Aggregates service count grouped by Free and discount tiers for the customer mobile home screen.
- **Auth:** None
- **Query:** `city` (optional)
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "categories": [
        { "key": "FREE", "label": "Free Service", "count": 14 },
        { "key": ">90%", "label": ">90% Discount", "count": 6 },
        { "key": "70-90%", "label": "70% – 90% Discount", "count": 12 },
        { "key": "50-70%", "label": "50% – 70% Discount", "count": 20 },
        { "key": "<50%", "label": "<50% Discount", "count": 8 }
      ]
    }
  }
  ```

#### `GET /api/v1/services/:id`
Returns full service profile, media gallery, terms, and date-by-date slot availability map.
- **Auth:** None
- **Response (200):** Contains `media` list and `availableDates` object mapping `YYYY-MM-DD` to remaining slot count.

#### `POST /api/v1/services`
Creates a new service offering under the authenticated Service Provider.
- **Auth:** Service Provider (`spOnly`)
- **Rules:**
  - `specialInstructions` and `termsAndConditions` are mandatory.
  - `media`: Minimum 3 photos required (`mediaType: "PHOTO"`).
  - For `DISCOUNTED`, `actualPrice` and `discountedPrice` calculate `discountPercentage`.
  - For `FREE`, optional `parentId` links free sub-services under a parent discounted service.
- **Body:**
  ```json
  {
    "serviceType": "FREE",
    "serviceDetail": "Complimentary Eye Checkup",
    "contactNumber": "9876543210",
    "address": "45 Anna Nagar",
    "city": "Chennai",
    "latitude": 13.0850,
    "longitude": 80.2100,
    "specialInstructions": "Bring previous prescription if available.",
    "termsAndConditions": "Valid Monday to Friday.",
    "startDate": "2026-09-15",
    "endDate": "2026-10-15",
    "media": [
      { "mediaType": "PHOTO", "mediaUrl": "https://s3.../1.jpg", "order": 0 },
      { "mediaType": "PHOTO", "mediaUrl": "https://s3.../2.jpg", "order": 1 },
      { "mediaType": "PHOTO", "mediaUrl": "https://s3.../3.jpg", "order": 2 }
    ]
  }
  ```

#### `PUT /api/v1/services/:id`
Updates service details and media gallery.
- **Auth:** Service Provider (`spOnly`)

#### `DELETE /api/v1/services/:id`
Soft-deletes a service, its associated slots, and child sub-services.
- **Auth:** Service Provider or Super Admin (`spOrSuperAdmin`)

---

### 6.6 Bookings Workflow

#### `POST /api/v1/bookings`
Books an appointment for a specific date within an active service slot.
- **Auth:** Customer (`customerOnly`)
- **Business Rules:**
  1. Service must be active and service provider must not be disabled.
  2. Booking date must be today or in the future and fall within slot `startDate` and `endDate`.
  3. Customer can book a **maximum of 2 services per day** across the entire platform.
  4. Customer cannot book the same service more than once on the same date.
  5. Daily quota (`slot.dailyCount`) must not be exceeded.
  6. Automatically assigns a human-readable booking code (`FB-YYYYMMDD-XXXX`) and generates a branded QR code image stored in AWS S3.
- **Body:**
  ```json
  {
    "serviceId": "uuid-v4",
    "bookingDate": "2026-09-20"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Booking confirmed successfully",
    "data": {
      "booking": {
        "id": "uuid-v4",
        "bookingCode": "FB-20260920-4821",
        "bookingDate": "2026-09-20T00:00:00.000Z",
        "status": "BOOKED"
      },
      "qrCodeUrl": "https://s3.../QR_FB-20260920-4821.png"
    }
  }
  ```

#### `GET /api/v1/bookings/my`
Returns customer booking history with status filters and aggregate counts.
- **Auth:** Customer (`customerOnly`)
- **Query:** `status` (`ALL`, `BOOKED`, `USED`, `EXPIRED`, `CANCELLED`, `REJECTED`), `page`, `limit`
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "bookings": [ ... ],
      "counts": {
        "BOOKED": 1,
        "USED": 4,
        "EXPIRED": 0,
        "CANCELLED": 1,
        "REJECTED": 0
      },
      "pagination": { "page": 1, "limit": 7, "total": 6, "pages": 1 }
    }
  }
  ```

#### `GET /api/v1/bookings/:id`
Retrieves full details for a specific customer booking including QR code and rating.
- **Auth:** Customer (`customerOnly`)

#### `POST /api/v1/bookings/:id/cancel`
Cancels a future booking with a mandatory reason.
- **Auth:** Customer (`customerOnly`)
- **Body:**
  ```json
  {
    "reason": "Unable to visit due to emergency."
  }
  ```

---

### 6.7 QR Code Validation & Redemption

#### `POST /api/v1/qr/validate`
Validates a customer QR code scanned by Service Provider staff.
- **Auth:** Service Provider (`spOnly`)
- **Validation Checks:**
  1. Service must belong to the scanning staff's Service Provider.
  2. Booking date must match **today's local date**.
  3. QR code must not have been previously redeemed (`isUsed === false`).
  4. Booking status must be `BOOKED` (not `CANCELLED`, `EXPIRED`, or `REJECTED`).
- **Body:**
  ```json
  {
    "qrData": "eyJib29raW5nQ29kZSI6IkZCLTIwMjYwOTIwLTQ4MjEi..."
  }
  ```
- **Response (Valid QR - 200):**
  ```json
  {
    "success": true,
    "valid": true,
    "message": "Valid QR Code",
    "data": {
      "bookingId": "uuid-v4",
      "bookingCode": "FB-20260920-4821",
      "customerName": "Arun Kumar",
      "serviceType": "FREE",
      "businessName": "Apex Salon & Spa"
    }
  }
  ```

#### `POST /api/v1/qr/use`
Accepts and redeems the booking upon providing the service.
- **Auth:** Service Provider (`spOnly`)
- **Body:**
  ```json
  {
    "bookingId": "uuid-v4"
  }
  ```
- **Action:** Sets `booking.status = 'USED'`, `booking.usedAt = now()`, `qrCode.isUsed = true`, `qrCode.scannedAt = now()`, `qrCode.scannedByUserId = staffUserId`.

#### `POST /api/v1/qr/reject`
Rejects a booking with an explanation.
- **Auth:** Service Provider (`spOnly`)
- **Body:**
  ```json
  {
    "bookingId": "uuid-v4",
    "reason": "Customer arrived outside operational hours."
  }
  ```
- **Action:** Sets `booking.status = 'REJECTED'`, `booking.rejectionReason = reason`, `booking.rejectedAt = now()`.

---

### 6.8 Ratings & Reviews

#### `POST /api/v1/ratings/booking/:bookingId`
Submits or updates a 1–5 star rating and review. Only permitted on bookings with status `USED`.
- **Auth:** Customer (`authenticate`)
- **Body:**
  ```json
  {
    "stars": 5,
    "review": "Excellent service and courteous staff!"
  }
  ```

#### `GET /api/v1/ratings/booking/:bookingId`
Retrieves review details submitted for a specific booking.
- **Auth:** Customer (`authenticate`)

#### `GET /api/v1/ratings/service/:serviceId`
Public endpoint returning paginated reviews and average star rating for a service.
- **Auth:** None (public)
- **Query:** `page`, `limit`
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "ratings": [ ... ],
      "averageStars": 4.8,
      "totalRatings": 24,
      "pagination": { "page": 1, "limit": 10, "total": 24, "pages": 3 }
    }
  }
  ```

---

### 6.9 Service Provider (SP) Web Portal

#### `GET /api/v1/sp-portal/dashboard`
Comprehensive dashboard analytics for the Service Provider.
- **Auth:** SP Super Admin (`spOnly`)
- **Response:**
  - `stats`: Breakdown of slot counts, booked, used, expired, cancelled per service.
  - `weeklyData`: Daily booking counts for the last 7 days.
  - `monthlyStats`: Monthly breakdown (Booked, Used, Expired, Cancelled) over the last 6 months.
  - `comparisonMetrics`: Month-over-month growth for bookings, revenue, and customers.
  - `subscriptionInfo`: Active status, days remaining until expiry, and admin contact information.

#### `GET /api/v1/sp-portal/stats`
Returns aggregated booking counts grouped by status (`BOOKED`, `USED`, `EXPIRED`, `CANCELLED`).
- **Auth:** SP Super Admin (`spOnly`)

#### `GET /api/v1/sp-portal/bookings`
Search and filter provider customer bookings.
- **Auth:** SP Super Admin (`spOnly`)
- **Query:** `status` (`all`, `booked`, `used`, `expired`, `cancelled`), `serviceType` (`all`, `free`, `discounted`), `fromDate`, `toDate`.

#### `POST /api/v1/sp-portal/profile`
Initial setup of Service Provider business profile for newly created SP accounts.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)
- **Body:**
  ```json
  {
    "businessName": "Apex Salon & Spa",
    "businessEmail": "owner@apexsalon.com",
    "address": "12 Velachery Main Rd",
    "city": "Chennai",
    "latitude": 12.9815,
    "longitude": 80.2180
  }
  ```

#### `GET /api/v1/sp-portal/profile`
Retrieves provider profile, active subscription status, total bookings, and aggregate review score.
- **Auth:** SP Super Admin (`spOnly`)

#### `GET /api/v1/sp-portal/staff`
Lists all mobile staff accounts (`MOBILE_SP`) created under this Service Provider.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)

#### `POST /api/v1/sp-portal/staff`
Creates an on-site staff user account with role `MOBILE_SP`.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)
- **Body:**
  ```json
  {
    "name": "Suresh Staff",
    "phone": "9876543211",
    "email": "suresh@apexsalon.com",
    "password": "StaffPassword@123"
  }
  ```

#### `PUT /api/v1/sp-portal/staff/:userId`
Updates staff name, active status (`isActive`), or resets password.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)

#### `DELETE /api/v1/sp-portal/staff/:userId`
Soft-deletes a staff account.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)

#### `PUT /api/v1/sp-portal/staff/:userId/password`
Direct password reset for a staff account.
- **Auth:** SP Super Admin (`spSuperAdminOnly`)

#### `GET /api/v1/sp-portal/slots` (and `/services`)
Retrieves all services and active slots for the provider, strictly enforcing the **"One service. One slot."** architecture.
- **Auth:** SP Super Admin (`spOnly`)

#### `POST /api/v1/sp-portal/slots`
Creates an availability slot for a service.
- **Auth:** SP Super Admin (`spOnly`)
- **Rules:**
  - Date ranges cannot be in the past (`fromDate >= today`).
  - `dailyCount` must be at least 1.
  - Automatically calculates `totalCount = dailyCount * days`.
  - Rejects creation if the service already has an active slot.
- **Body:**
  ```json
  {
    "serviceId": "uuid-v4",
    "fromDate": "2026-09-15",
    "toDate": "2026-10-15",
    "dailyCount": 10
  }
  ```

#### `PUT /api/v1/sp-portal/slots`
Updates dates or daily capacity of an existing slot and synchronizes parent service start and end dates.
- **Auth:** SP Super Admin (`spOnly`)
- **Body:**
  ```json
  {
    "slotId": "uuid-v4",
    "fromDate": "2026-09-15",
    "toDate": "2026-10-31",
    "dailyCount": 15
  }
  ```

---

### 6.10 Super Admin Control Panel

#### `GET /api/v1/admin/dashboard`
Comprehensive platform-level analytics:
- **Platform Totals:** Customers, Providers, Bookings (Free vs Discounted, Used vs Expired).
- **Monthly Trajectory:** Last 6 months registration and booking growth.
- **Top Service Providers:** Ranked by booking volume and contribution percentage.
- **Demographics:** Gender distribution, age groups (18-25, 26-35, 36-45, 46+), top cities.
- **Filtering:** Supports `?state=Tamil+Nadu&cities=Chennai,Coimbatore`.
- **Conversion Funnel:** Total Slots → Booked → Used → Rated.
- **Revenue Growth:** Running cumulative revenue curve from Subscriptions.
- **Recent Activities Stream:** Real-time log of claims, bookings, and new service listings.
- **Auth:** Super Admin (`superAdminOnly`)

#### `GET /api/v1/admin/demographics`
Standalone demographic inquiry filtering customers by state and specific cities.
- **Auth:** Super Admin (`superAdminOnly`)
- **Query:** `state`, `cities`

#### `GET /api/v1/admin/providers`
Searchable directory of all registered Service Providers with days remaining in subscription.
- **Auth:** Super Admin (`superAdminOnly`)
- **Query:** `search` (matches business name, owner phone, emails, city, or service contact).

#### `POST /api/v1/admin/providers`
Onboards a new Super Service Provider organization, creates the `SP_SUPER_ADMIN` login account, and provisions an initial subscription.
- **Auth:** Super Admin (`superAdminOnly`)
- **Body:**
  ```json
  {
    "phone": "9876543210",
    "password": "TemporaryPassword@123",
    "businessName": "Apollo Diagnostic Lab",
    "businessEmail": "contact@apollodiag.com",
    "profilePic": "https://s3.../logo.png",
    "primaryContact": "9876543210",
    "secondaryContact": "9876543219",
    "address": "100 Mount Road",
    "city": "Chennai",
    "latitude": 13.0600,
    "longitude": 80.2500,
    "startDate": "2026-09-01",
    "endDate": "2027-09-01"
  }
  ```

#### `PUT /api/v1/admin/providers`
Updates provider details, toggles active status (`isActive`), resets passwords, and synchronizes updates across linked services.
- **Auth:** Super Admin (`superAdminOnly`)
- **Body:**
  ```json
  {
    "spId": "uuid-v4",
    "isActive": true,
    "businessName": "Apollo Diagnostic Center",
    "newPassword": "NewAdminPassword@123"
  }
  ```

#### `GET /api/v1/admin/customers`
Searchable customer registry with booking history.
- **Auth:** Super Admin (`superAdminOnly`)
- **Query:** `search` (matches customer name or phone number).

#### `GET /api/v1/admin/revenue`
List of all recorded provider subscriptions with active indicator and date ranges.
- **Auth:** Super Admin (`superAdminOnly`)

#### `POST /api/v1/admin/revenue`
Records a new subscription period for a Service Provider.
- **Auth:** Super Admin (`superAdminOnly`)
- **Body:**
  ```json
  {
    "spId": "uuid-v4",
    "startDate": "2026-10-01",
    "endDate": "2027-10-01"
  }
  ```

#### `PUT /api/v1/admin/revenue`
Modifies subscription dates or active status.
- **Auth:** Super Admin (`superAdminOnly`)

#### `GET /api/v1/admin/expiry`
Subscription expiry tracker sorted by urgency:
1. `EXPIRING_SOON` (0 to 15 days remaining)
2. `ACTIVE` (> 15 days)
3. `EXPIRED` (Past end date)
4. `NONE` (No subscription on record)
- **Auth:** Super Admin (`superAdminOnly`)

#### `POST /api/v1/admin/expiry/send-reminders`
Dispatches automated email renewal reminders to providers whose subscriptions are expiring soon (<= 15 days) or expired.
- **Auth:** Super Admin (`superAdminOnly`)
- **Body:**
  ```json
  {
    "target": "EXPIRING",
    "spId": "uuid-v4"
  }
  ```
- **Notes:** `spId` is optional (omitting dispatches to all matching providers). `target` can be `EXPIRING` or `EXPIRED`.

---

### 6.11 File & Media Uploads

#### `POST /api/v1/upload`
Uploads files (photos/videos) to AWS S3 into dedicated directories based on asset type.
- **Auth:** Required (`authenticate`)
- **Content-Type:** `multipart/form-data`
- **Fields:**
  - `file`: Binary file stream (Images: JPEG, PNG, WebP; Videos: MP4, MOV, AVI; Max: 10 MB).
  - `assetType`: Target folder descriptor:
    - `user-profile` ➔ `user-profiles/<userId>/`
    - `sp-profile` / `service-provider-logo` ➔ `service-providers/<spId>/profile/`
    - `free-services` ➔ `service-providers/<spId>/free-services/`
    - `discount-services` ➔ `service-providers/<spId>/discount-services/`
    - *(default)* ➔ `general/`
  - `spId`: Target Service Provider ID (optional, defaults to authenticated user's `serviceProviderId`).
- **Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "url": "https://freebiz-assets.s3.ap-south-1.amazonaws.com/service-providers/sp-123/free-services/1726243200-service.png"
    }
  }
  ```

---

## 7. Automated Background Jobs & Cron Tasks

1. **Expired Bookings Job (`setupExpiredBookingsJob`):**
   - **Frequency:** Every 1 hour.
   - **Action:** Scans bookings with status `BOOKED` where `bookingDate < today`.
   - **Update:** Updates status to `EXPIRED` and sets `expiredAt = now()`.

2. **Daily Subscription Status Job (`setupSubscriptionJob`):**
   - **Frequency:** Daily (every 24 hours).
   - **Action:** Updates subscriptions where `endDate < today` to `status: "EXPIRED"`.

---

## 8. Setup, Migration, & CLI Utility Scripts

### Running Locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run database migrations
npm run prisma:migrate

# 5. Seed initial data
npm run prisma:seed

# 6. Start development server with hot-reload
npm run dev
```

### Management CLI Scripts
- **Create Super Admin User:**
  ```bash
  npm run create-superadmin
  # Or with custom credentials:
  npx ts-node src/scripts/create-superadmin.ts <username> <password> <email> <name>
  ```
- **Remove Default Test Service Provider:**
  ```bash
  npm run remove-default-sp
  ```
- **Sync Provider Email Addresses:**
  ```bash
  npx ts-node src/scripts/sync-sp-emails.ts
  ```
- **Prisma Studio (Visual Database Browser):**
  ```bash
  npm run prisma:studio
  ```
