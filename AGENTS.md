# CeilingMarketApp - Project Overview & Guidelines

## 1. Product Description

CeilingMarketApp is a marketplace platform that connects employers with installers and specialists for repair and construction services.

The main goal of the application is to create a professional marketplace where:
- Employers can publish repair/construction tasks.
- Installers can find suitable jobs nearby.
- Employers can select the best specialist.
- Both sides can communicate, complete work, and leave reviews.

The application is not a simple classifieds board. It is a transactional marketplace with:
- orders
- responses
- selection process
- execution tracking
- reviews
- ratings
- reputation system

---

## 2. User Roles

### Employer
Employer is a person/company that creates orders.
Capabilities:
- Create order
- Edit order
- Publish order
- Receive installer responses
- Review installer profiles
- Select installer
- Communicate in chat
- Track order status
- Confirm completion
- Leave review

### Installer
Installer is a specialist who performs work.
Capabilities:
- Create professional profile
- Add skills
- Add portfolio
- Set work categories
- View available orders
- Respond to orders
- Communicate with employers
- Accept work
- Complete orders
- Receive ratings

---

## 3. Repository Structure

### Frontend
- **Location:** `/src` (or mobile root directory)
- **Technology:** Expo, React Native, TypeScript
- **Responsibilities:** Mobile UI, Authentication screens, User profiles, Orders screens, Map interface, Chat, Notifications, Local state management.

### Backend
- **Location:** `/backend` (or backend root directory)
- **Technology:** NestJS, Prisma ORM, PostgreSQL
- **Responsibilities:** Authentication, Users, Profiles, Orders, Responses, Reviews, Permissions, Business logic, Database operations.

---

## 4. Main Features

### Authentication
Current authentication flow is phone number based:
1. User enters phone
2. OTP verification
3. Profile creation
4. Application access

*Note: Authentication must not be redesigned without explicit request.*

---

## 5. Core Modules

- **Users Module:** Handles registration, profiles, roles, permissions, and user data.
- **Orders Module:** Handles creating orders, storing order info, managing order statuses, and connecting employers and installers.
- **Responses Module:** Handles installer responses, employer selection, and response lifecycle.
- **Map Module:** Displays available orders, geographic filtering, markers, viewport loading, and clustering.
- **Reviews Module:** Handles ratings, feedback, and reputation.

---

## 6. Technology Stack

- **Mobile:** Expo, React Native, TypeScript, React Navigation, Native modules.
- **Backend:** NestJS, Prisma, PostgreSQL.
- **Maps:** `react-native-maps`, `MapEngine`, `GeoClusterService`, `EntityStore`, `SpatialManager`.
- **Important:** The existing `MapEngine` architecture must be preserved. Do not replace it with another implementation.

---

## 7. Development Environment

- Development is currently local.
- **Backend:** Local development server.
- **Database:** PostgreSQL development database in Docker.
- *Production infrastructure is not the priority during debugging tasks.*

---

## 8. Current Development Philosophy

This is an existing application. The goal is to:
- stabilize
- debug
- improve
- **NOT** rewrite, redesign, or replace architecture.

Before any code modification:
1. Understand existing flow.
2. Locate exact problem.
3. Explain root cause.
4. Make smallest possible fix.

---

## 9. Important AI Agent Rules

- **DO:** Inspect existing code first, respect existing architecture, avoid duplicate implementations, avoid unnecessary migrations, avoid changing unrelated files.
- **DO NOT:** Create new `MapEngine` versions, replace working services, rewrite backend modules, modify database schema without reason, update dependencies without request.

---

## 10. Current Priority Problems

Current main debugging areas:
1. Order visibility on map.
2. Synchronization between backend and frontend.
3. Real-time updates.
4. Stability.

**Main investigation principle (Follow the real data flow):**
```
Backend API
↓
Frontend request
↓
State management
↓
MapEngine
↓
EntityStore
↓
Marker rendering
```
*Find where data disappears.*
