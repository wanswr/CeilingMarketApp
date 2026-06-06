# CeilingsApp Backend

NestJS backend for the CeilingsApp mobile application.

## Tech Stack
- **Framework:** NestJS
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Auth:** JWT + Passport

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL database

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```

4. Initialize the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### Running the server

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## API Modules

### Auth
- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login and receive JWT

### Users
- `GET /api/users/profile`: Get current user profile
- `PATCH /api/users/profile`: Update profile data

### Orders
- `GET /api/orders`: Get list of orders (with filters for location, radius, and price)
- `POST /api/orders`: Create a new order
- `GET /api/orders/:id`: Get order details
- `PATCH /api/orders/:id`: Update order
- `DELETE /api/orders/:id`: Remove order
- `POST /api/orders/:id/apply`: Apply for an order (requires active subscription for workers)

### Subscriptions
- `POST /api/subscriptions/activate`: Activate/Renew subscription
