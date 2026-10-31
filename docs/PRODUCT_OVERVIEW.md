# Zaboni (Marsool) — Complete Platform Overview

## Table of Contents
1. [Overview](#overview)
2. [Mobile App — Customer Features](#mobile-app--customer-features)
3. [Mobile App — Courier Features](#mobile-app--courier-features)
4. [Admin Dashboard](#admin-dashboard)
5. [Backend API Server](#backend-api-server)
6. [Technical Stack](#technical-stack)
7. [Why Apple Rejected the App](#why-apple-rejected-the-app)
8. [Why Google Play Accepted the App](#why-google-play-accepted-the-app)
9. [Solutions to Get Apple Approval Without an Organization Account](#solutions-to-get-apple-approval-without-an-organization-account)

---

## Overview

**Zaboni (مرسول)** is an on-demand local delivery platform that connects customers with nearby couriers to deliver food, groceries, and goods from local businesses. The platform is currently focused on the Syrian market with full Arabic (RTL) and English (LTR) language support.

The platform consists of three components:
- **Mobile App** — single React Native (Expo) app serving both customers and couriers, with role switching
- **Admin Dashboard** — web-based management panel for platform operators
- **Backend API Server** — Node.js Express API powering both clients

---

## Mobile App — Customer Features

### Authentication & Onboarding
- Phone number login with international country code support and searchable picker
- 6-digit OTP verification via SMS with auto-resend countdown
- New user name setup screen
- 3-slide introductory onboarding flow for first-time users

### Home Screen
- Auto-scrolling promotional banner carousel linking to specific restaurants or offers
- Category filter bar (All, Burgers, Pizza, Groceries, etc.)
- Dynamic restaurant list showing name, rating, estimated delivery time, and distance
- Active order sticky banner when an order is in progress

### Search
- Real-time search across restaurants and individual menu items

### Restaurant & Menu
- Restaurant profile with cover image, rating, distance, and operating hours
- Full menu organized by categories and subcategories
- "Popular" item tags
- Persistent cart footer with item count and running total

### Ordering
- Checkout screen for order details (text-based or from cart)
- Saved address selection or new address entry via interactive map
- Promo code input with real-time validation and discount display
- Delivery fee estimate based on distance from restaurant
- Order total summary before final confirmation

### Live Order Tracking
- Real-time map showing courier location, customer location, and restaurant
- Live ETA display
- Visual step-by-step status progress: Searching → Accepted → Picked Up → On the Way → Delivered
- Direct call and WhatsApp buttons to contact the courier
- Order cancellation available before a courier accepts

### Post-Delivery
- Star rating for both the restaurant and the courier
- Optional written feedback

### Profile & Account
- Personal info management (name, profile photo)
- Saved addresses with map-based picker and labels (Home, Work, Other)
- Favorite restaurants list
- Full order history
- In-app notification center for order updates and promotions
- Account deletion option

---

## Mobile App — Courier Features

Users can apply to become couriers within the same app and toggle between customer and courier mode once approved by an admin.

### Courier Application
- In-app application form with vehicle type (Motorcycle, Car, Bicycle), license plate, and ID number
- Application status tracking (Pending, Approved, Rejected)

### Available Orders
- Real-time feed of nearby delivery requests
- Online/Offline toggle to control availability
- One-tap order acceptance with full order details preview

### Active Order Workflow
- Integrated map with navigation button (opens Google Maps / Apple Maps)
- Step-by-step status buttons: Mark as Picked Up → On the Way → Delivered
- Quick access to call or WhatsApp both the customer and the restaurant

### Wallet
- Current balance display
- Full transaction history (earnings, deductions, deposits)
- Submit cash deposit requests to top up balance

### Earnings
- Income breakdown filtered by day, week, or month
- Net earnings shown after subscription fee deductions

### Courier Profile
- Delivery history and ratings summary
- Subscription history log

---

## Admin Dashboard

### Dashboard & Analytics
- Live platform statistics: total orders, restaurants, customers, couriers, menu items
- Order volume trend chart (7 / 14 / 30 day views)
- Order status distribution pie chart
- Peak hours bar chart (busiest times of day)
- Live feed of all currently active orders
- WhatsApp OTP gateway health monitoring with connectivity logs

### Order Management
- Full order list with search by customer, restaurant, or courier
- Status filters (Searching, Accepted, Picked Up, On the Way, Delivered, Cancelled)
- Expandable order detail rows
- Manual order status override
- CSV export for external reporting

### User Management
- Full user directory with role filtering (Customer / Courier)
- Courier performance view: total deliveries, success rate, average rating, last delivery time
- Demote a courier back to customer status

### Courier Applications
- Review queue for new driver applications
- Vehicle details, ID number, and applicant info display
- Approve or reject with notes

### Restaurant & Menu Management
- Full create/edit/delete for restaurants (name, logo, location, phone, status)
- Map-based location picker
- Nested menu item management (price, category, subcategory, popular flag)
- Daily operating hours scheduling
- Category management for the app home screen

### Financial Management
- Revenue summary: platform earnings from subscription fees and delivery commissions
- Daily courier subscription tracking with payment recording, waiver, and pending status
- Wallet deposit request review

### Marketing & Communication
- Promo code creation (fixed amount or percentage, usage limits, expiry dates)
- Push notification broadcasts to all users, customers only, or couriers only
- Targeted notifications to individual users by search
- Promotional banner management for the app home screen

### Logistics
- Delivery zone pricing: configure per-kilometer fee tiers
- Live courier map: real-time GPS positions of all online/offline couriers and active order locations

### System Settings
- WhatsApp gateway connection via QR code with status monitoring
- SMS gateway configuration (custom API provider) as OTP fallback
- Webhook alerts setup (e.g., Slack) for system monitoring
- Global settings: support contact number, default daily subscription fee

---

## Backend API Server

### Authentication
- OTP generation and delivery via WhatsApp or SMS
- JWT-based session tokens
- Role-based access control (Customer, Courier, Admin)
- Device token registration for push notifications

### Orders
- Order creation with automatic nearby courier notification
- Full order lifecycle management with status history
- Real-time courier GPS location delivery to the customer
- Delivery fee calculation using the Haversine distance formula
- Promo code validation (usage limits, expiry, per-user rules)
- Order rating submission

### Courier Operations
- Courier application submission and status tracking
- Online/offline availability toggle
- Real-time GPS location updates
- Available order feed based on proximity
- Order acceptance and status transitions
- Earnings calculation with subscription fee deductions

### Restaurants & Content
- Restaurant listing with real-time open/closed status (Damascus timezone)
- Full menu delivery per restaurant
- Category and promotional banner endpoints

### Push Notifications
- Multi-provider delivery: Firebase Cloud Messaging (FCM), Expo, and Apple Push Notification service (APNs)
- Broadcast and targeted notification support

### Storage
- Presigned URL generation for secure image uploads (avatars, restaurant photos, menu items)
- Public asset serving

### Background Jobs
- Automatic order expiry for stale "searching" orders with no courier response
- WhatsApp gateway health monitoring service

---

## Technical Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo |
| Admin Panel | React + Vite + Tailwind CSS + TanStack Query |
| Backend | Node.js + Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod |
| API Codegen | OpenAPI + Orval |
| Push Notifications | FCM + Expo Push + APNs |
| Object Storage | Replit Object Storage (Google Cloud Storage backend) |
| Maps | Native maps (Google Maps / Apple Maps) |
| Languages | Arabic (RTL) + English (LTR) |

---

## Why Apple Rejected the App

Apple rejected the app under **Guideline 5.1.1(ix) — Legal: Privacy: Data Collection and Storage**.

**The rejection reason:**

> The app does not meet all requirements for apps that offer highly regulated services or handle sensitive user data. Specifically: the account that submits the app must be enrolled in the Apple Developer Program as an organization, and not as an individual.

**Why Apple considers Zaboni "highly regulated":**
- The app handles **sensitive personal data** (full name, phone number, home and work addresses, real-time GPS location)
- It operates in the **delivery/logistics** category, which Apple treats as a regulated business activity
- Couriers in the app earn money, which involves financial accountability

**Apple's requirement for this category:**
- Developer account must be enrolled as an **Organization**, not an **Individual**
- This requires a legal business entity, a D-U-N-S number, and proof of organization legitimacy
- The issue **cannot be resolved with code changes** — it is an account-level requirement

This rejection is independent of how well the app is built. Even a perfect app will be rejected if the developer account type does not match Apple's requirements for the app's category.

---

## Why Google Play Accepted the App

Google Play has a fundamentally different policy approach.

**Google's stance on individual developer accounts:**
- Google Play **does not require** an organization account for delivery, financial, or sensitive-data apps
- Individual developer accounts can publish any type of app, provided the app complies with Google's content and data policies
- The focus is on **what the app does and how it handles data**, not on who owns the developer account

**Why Zaboni passed Google Play's review:**
1. **Privacy Policy** was provided and accessible
2. **Data Safety section** was filled out accurately, declaring all collected data (phone, location, name)
3. **Permissions** (location, notifications, camera) were justified in context
4. **Closed testing** was completed with 12+ testers over a 2-week period — Google's hard requirement for new personal accounts before public release
5. **Bugs found during testing were fixed** (notably the map crash on the address screen) and reported transparently in the readiness questionnaire
6. **Content rating** was completed honestly (adult-oriented utility app)
7. The app was **fully functional** with no crashes during the review period

**The critical insight:** Google Play approves apps based on policy compliance and quality. Apple approves apps based on policy compliance, quality, **and developer account type for certain categories**. Zaboni meets all functional and policy requirements — the only blocker for Apple is the account type.

---

## Solutions to Get Apple Approval Without an Organization Account

Apple's organization requirement for Guideline 5.1.1(ix) is strict, but there are realistic workarounds that do not require forming a legal company.

### Solution 1 — Enroll as a Sole Proprietor with a D-U-N-S Number (RECOMMENDED)

Apple accepts sole proprietors and self-employed individuals as "organizations" for enrollment purposes. This is the cleanest path.

**What you need:**
- A free **D-U-N-S number** registered under your own name as a sole proprietor (apply at developer.apple.com/enroll)
- Your personal address and phone number (used as your business address)
- 1–2 weeks waiting time for the D-U-N-S registration

**Result:** You convert your existing account from Individual to Organization without forming a company. Apple sees you as an organization, the rejection no longer applies, and you can resubmit the same app build.

---

### Solution 2 — Have the End Client Submit the App

If Zaboni is being built for a third-party business or partner, the cleanest legal and technical solution is for that business to publish the app under their own Apple Developer Organization account.

**Steps:**
1. The client creates their own Apple Developer Organization account
2. You transfer ownership of the app build to them via Apple's app transfer process
3. They submit the app for review under their account

**Best for:** White-label or contracted projects where the client owns the brand.

---

### Solution 3 — Publish Through a Mobile App Publisher

Several companies operate as licensed publishers and submit apps on behalf of independent developers under their organization accounts. They handle the App Store relationship in exchange for a fee or revenue share.

**Pros:** No need to form a company or wait for D-U-N-S registration.
**Cons:** Ongoing cost and reduced control over the App Store listing.

---

### Solution 4 — Distribute as a Progressive Web App (PWA)

iPhone users can install Zaboni as a Progressive Web App from Safari directly to their home screen, completely bypassing the App Store.

**Pros:**
- No App Store review at all
- Instant updates without resubmission
- No developer account required

**Cons:**
- No native push notifications via APNs (limited web push only on newer iOS versions)
- Limited access to native device features
- Users must discover and install manually rather than searching the App Store

**Best for:** Stopgap distribution while the organization account is being processed.

---

### Solution 5 — Focus on Android-Only Distribution

Since Google Play has already approved the app and has no organization account restriction, the app can launch on Android first while the iOS path is being resolved. In Syria and most of the Middle East, Android holds a dominant market share, making this a fully viable launch strategy.

---

### Recommended Path Forward

**For an independent developer launching their own delivery business:**
1. **Immediate:** Launch on Google Play (already approved) and serve Android users
2. **Short-term:** Apply for a D-U-N-S number under your own name (Solution 1)
3. **2–4 weeks later:** Convert your Apple account to Organization status and resubmit the iOS app

**For a project being built for a client:**
- Use Solution 2 — have the client's company own the App Store listing.

The D-U-N-S route is the most cost-effective and permanent solution. It does not require forming a company, has no ongoing fees, and grants full control of the App Store listing under your own name.
