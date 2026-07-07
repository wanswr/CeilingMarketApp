# CeilingsApp

Professional marketplace for ceiling masters and customers.

## Project Structure

- `src/`: React Native (Expo) frontend application.
- `backend/`: NestJS backend application with Prisma and PostgreSQL.

## Getting Started

### Backend Setup

1. Navigate to `backend/`.
2. Install dependencies: `npm install`.
3. Create `.env` from `.env.example` and set your `DATABASE_URL`.
4. Run migrations: `npx prisma db push`.
5. Start the server: `npm run start:dev`.

### Frontend Setup

1. Install root dependencies: `npm install`.
2. Update `API_URL` in `src/services/ApiService.ts` with your machine's IP.
3. Start Expo: `npx expo start`.

## Features

- Real-time map with order locations.
- Modern 2026 UI/UX design.
- Secure phone-based authentication.
- Advanced geo-filtering.
