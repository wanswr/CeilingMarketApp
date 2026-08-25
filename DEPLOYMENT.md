# CeilingsApp Deployment & Environment Isolation Guide

This document defines the environment isolation and deployment rules across Local Development, Staging, and Production environments.

---

## 1. Environment Architecture & Isolation Matrix

| Setting / Variable | Local Development | Staging Environment | Production Environment |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` / `APP_ENV` | `development` | `staging` | `production` |
| **Backend API URL** | `http://127.0.0.1:3000/api/` | `https://staging-api.ceilingsapp.com/api/` | `https://api.ceilingsapp.com/api/` |
| **WebSocket URL** | `http://127.0.0.1:3000` | `https://staging-api.ceilingsapp.com` | `https://api.ceilingsapp.com` |
| **Database Instance** | Local PostgreSQL (`ceilingsapp_dev`) | Staging Isolated DB (`ceilingsapp_staging`) | Production Master DB (`ceilingsapp_prod`) |
| **Redis Cache / Gateway**| Local Redis (`localhost:6379`) | Staging Redis Cluster | Production Redis Master |
| **JWT Secret** | Developer local secret | Secure Staging Secret | Secure High-Entropy Production Secret |

---

## 2. Startup Fail-Fast Validation Rules

The backend executes startup environment validation (`backend/src/common/config/env-validation.ts`) prior to accepting HTTP/WS connections:

1. **Mandatory JWT_SECRET**: Application refuses to start if `JWT_SECRET` is missing.
2. **Weak Key Guard**: Application refuses to start if `JWT_SECRET` matches insecure defaults (`your-super-secret-key`, `secret`, `123456`).
3. **Staging Isolation Guard**: When `APP_ENV=staging` or `NODE_ENV=staging`, the backend verifies that `DATABASE_URL` does not point to a production database host or instance containing production keywords (`prod`, `production`, or matching `PROD_DATABASE_URL`). Attempting to launch staging with production credentials triggers an immediate startup crash.

---

## 3. Configuration Setup & Secret Management

- **Local Development**: Copy `backend/.env.example` to `backend/.env`. Real `.env` files are ignored by git.
- **Staging Deployment**: Copy `backend/.env.example.staging` to `backend/.env.staging` on the staging server / secret manager.
- **EAS Builds**: Mobile app build profiles in `eas.json` (`development`, `preview`, `staging`, `production`) define target `API_URL` and `SOCKET_URL` variables.

Secrets must **NEVER** be committed to source control or exposed in client builds.
