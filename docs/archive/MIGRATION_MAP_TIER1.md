# MIGRATION MAP: V10 TO TIER-1 ARCHITECTURE

This document provides a technical path to refactor the current V10 codebase into a Tier-1 production architecture.

---

## 1. FRONTEND: FROM MONOLITH TO FEATURE-BASED (FSD)

### Current Structure:
`src/screens`, `src/services`, `src/context`

### Target Structure (Feature-Sliced Design):
`src/features/matching`, `src/features/orders`, `src/shared/api`, `src/entities/user`

### File Migration Path:
| File | Tier-1 Destination | Refactoring Strategy |
| :--- | :--- | :--- |
| `src/services/EntityStore.ts` | `src/shared/lib/storage/mmkv` | Replace `AsyncStorage` with `react-native-mmkv`. Use `Zustand` for state management instead of a custom class to improve performance and dev-experience. |
| `src/services/MapEngine.ts` | `src/features/matching/model/MapController` | Decompose `MapEngine` into: 1) Camera tracking, 2) Data synchronization, 3) Realtime event handlers. |
| `src/screens/MapScreen.tsx` | `src/pages/map` | Refactor into smaller components: `MarkerLayer`, `SearchOverlay`, `OrderPreview`. Use `memo()` for markers. |
| `src/context/AuthContext.tsx` | `src/entities/session` | Migrate to a more robust session management with Refresh Token rotation logic. |
| `src/utils/geo.ts` | `src/shared/lib/geo/h3` | Add `h3-js` library for hexagonal indexing. |

---

## 2. BACKEND: FROM NESTJS MONOLITH TO MICROSERVICES

### File Migration Path:
| File | Tier-1 Destination | Refactoring Strategy |
| :--- | :--- | :--- |
| `orders.service.ts` | `services/order-service`, `services/matching-service` | **SPLIT:** Move geo-matching logic into a dedicated service (potentially in Go or Rust for high performance). Use `Prisma` only for CRUD; use raw SQL with `PostGIS` for complex spatial queries. |
| `app.gateway.ts` | `services/comm-service/gateway` | Implement `Distributed Websockets` using `Redis Adapter`. Move `getGeoRoom` logic to H3 indexing. |
| `orders.controller.ts` | `api-gateway/routes/orders` | Move to the Gateway layer. Add `Joi/Zod` validation and `Rate Limiting` decorators. |
| `prisma/schema.prisma` | `infrastructure/db/schema` | Add `id_h3` (String) field to `Order` and `User` models. Add PostGIS extensions. |

---

## 3. INFRASTRUCTURE & EVENT BUS

### New Components to Introduce:
1.  **Event Bus (Kafka/RabbitMQ):**
    *   `OrdersService` emits `ORDER_CREATED` event.
    *   `NotificationService` (New) consumes event → Sends Push.
    *   `MatchingEngine` (New) consumes event → Finds H3 neighbors → Notifies via WS.
2.  **Monitoring (Observability):**
    *   Add `OpenTelemetry` decorators to all `ApiService` calls and `OrdersService` methods.
    *   Integrate **Prometheus** for metrics scraping.
3.  **Redis Cluster:**
    *   Implement as a distributed session store for WebSockets to allow multiple backend instances.

---

## 4. TECH STACK COMPARISON (V10 VS TIER-1)

| Feature | CeilingsApp V10 | Tier-1 Production |
| :--- | :--- | :--- |
| **Local Storage** | AsyncStorage | MMKV + SQLite |
| **Geo Indexing** | Fixed 0.1° Grid | H3 Hexagonal Indexing |
| **Spatial Engine** | Simple BBox | PostGIS (ST_DWithin) |
| **Realtime** | Socket.io (Memory) | Socket.io (Redis Adapter) |
| **Service Comm** | Direct Method Calls | Kafka / BullMQ Events |
| **Auth** | JWT (Single) | JWT + Refresh Token Rotation |
| **Observability** | Console logs | ELK + Jaeger + Prometheus |

---

## 5. REFACTORING ROADMAP (PRIORITY)

1.  **Step 1: Storage Layer.** Replace `AsyncStorage` with `MMKV`. This is the lowest risk and highest impact for UI smoothness.
2.  **Step 2: Geo Core.** Add `PostGIS` to PostgreSQL and start populating `id_h3` for new orders.
3.  **Step 3: Event Decoupling.** Introduce a message broker and move "Send Notification" logic out of `OrdersService`.
4.  **Step 4: Microservice Split.** Move the `Matching Engine` logic into its own service once MAU hits 50k.
