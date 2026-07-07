# EVOLUTIONARY MIGRATION MAP: V10 TO TIER-1

This document outlines the file-by-file transformation strategy to upgrade CeilingsApp V10 to a Tier-1 production architecture without disrupting the existing product.

---

## 1. FRONTEND: FEATURE-SLICED DECOMPOSITION

| Current File (V10) | Tier-1 Destination (FSD) | Action | Reason / Strategy |
| :--- | :--- | :--- | :--- |
| `src/services/EntityStore.ts` | `src/shared/api/entity-cache.ts` | **Leave & Extend** | Retain as a normalized cache. Integrate `MMKV` for persistence. Do not use for server-state (move to React Query). |
| `src/services/MapEngine.ts` | `src/features/map/model/MapController.ts` | **Split** | Decompose into `MapController` (Logic), `CameraManager.ts`, and `GeoSyncService.ts`. Move marker logic to `MarkerEngine.ts`. |
| `src/context/AuthContext.tsx` | `src/entities/session/model/auth.ts` | **Move & Rewrite** | Migrate to JWT + Refresh Token logic. Use `SecureStore` for tokens, but move user metadata to `MMKV`. |
| `src/services/ApiService.ts` | `src/shared/api/base-api.ts` | **Rewrite** | Switch to `React Query` hooks. `ApiService` becomes a set of clean fetchers without local caching (delegated to React Query). |
| `src/services/SocketService.ts` | `src/shared/api/socket-provider.ts` | **Move** | Move to `shared` and add `PresenceManager` to handle online status and room joins based on H3 cells. |
| `src/screens/MapScreen.tsx` | `src/pages/map/ui/MapPage.tsx` | **Refactor** | Extract sub-components: `SearchOverlay`, `MapSettings`, `ActiveOrderCard`. Use `Zustand` for local UI state (filters, etc.). |
| `src/screens/OrderDetailScreen.tsx` | `src/pages/order-details/ui/...` | **Refactor** | Split into `OrderHeader`, `ApplicationList`, and `ActionFooter`. Logic moves to `features/order-actions`. |

---

## 2. BACKEND: MODULAR MONOLITH (DDD)

| Current Module (V10) | Tier-1 Destination | Action | Reason / Strategy |
| :--- | :--- | :--- | :--- |
| `orders.service.ts` | `modules/orders/application/...` | **Rewrite (Modular)** | Separate into `Domain` (Rules), `Application` (Use Cases), and `Infrastructure` (Prisma/DB). |
| `gateway/app.gateway.ts` | `modules/realtime/infrastructure/...` | **Move & Extend** | Implement `Redis Adapter` for horizontal scaling. Transition room logic from Grid to H3. |
| `orders.controller.ts` | `modules/orders/infrastructure/api/...` | **Move** | Isolate API layer from business logic. Add DTO validation using `Zod`. |
| `prisma/schema.prisma` | `shared/database/schema.prisma` | **Leave & Extend** | Add `h3_index` (String) and PostGIS `geometry` fields. Keep lat/lng for backwards compatibility. |

---

## 3. GEO-ARCHITECTURAL EVOLUTION (ZERO DOWNTIME)

*   **Phase 1 (Shadow Indexing):** Keep existing 0.1° grid. Add H3 index generation on every Order creation/update. Store in a new field.
*   **Phase 2 (Read Testing):** Start using PostGIS/H3 for internal matching/discovery logic in "shadow mode" to compare results with the old grid.
*   **Phase 3 (Cutover):** Switch the Map API to use H3 neighbors for order fetching. Remove the 0.1° grid logic once stability is verified.

---

## 4. EVENT-DRIVEN CORE

| Domain Event | Primary Handler | Secondary Consumers (Queues) |
| :--- | :--- | :--- |
| `OrderCreated` | `OrdersModule` | `MatchingService` (H3 neighbors), `PushService`, `Analytics` |
| `ApplicationNew` | `OrdersModule` | `RealtimeGateway` (User room), `NotificationService` |
| `MessageSent` | `ChatModule` | `RealtimeGateway` (Chat room), `UnreadCounterService` |

**Tech Choice:** Start with **BullMQ + Redis**. It integrates perfectly with NestJS. Migrate to **Kafka** only when concurrent events exceed 5,000/sec.

---

## 5. LOAD VALIDATION & UPGRADE PATH

| Load Level | What Works (V10) | Potential Bottleneck | Tier-1 Upgrade Needed |
| :--- | :--- | :--- | :--- |
| **10k Users** | MapEngine, EntityStore | `AsyncStorage` speed | Implement `MMKV` for persistence. |
| **100k Users** | NestJS Core | WebSocket Memory (Monolith) | WebSocket `Redis Adapter` + BullMQ for async tasks. |
| **1M Users** | PostgreSQL (Basic) | Spatial Query Latency | Full **PostGIS** integration + H3 Hexagonal clustering. |

---

## 6. FINAL CTO VERDICT (THE 30-DAY PLAN)

### 30-Day Execution:
1.  **Storage Swap:** Replace `AsyncStorage` with **MMKV** (3 days). Highest impact on UX.
2.  **Server State:** Integrate **React Query** for all API calls (5 days). Solves 90% of data race conditions.
3.  **H3 Shadow:** Add H3 indexing fields to the DB and start populating them (2 days).
4.  **Realtime Hardening:** Add **Redis Adapter** to Socket.io and implement **BullMQ** for Push Notifications (10 days).

### DO NOT TOUCH TABLE (Conservation Zone):
| Component | Why? |
| :--- | :--- |
| **EntityStore Normalization** | The logic of how entities are stored by ID is sound. Only change the storage engine. |
| **Prisma (for CRUD)** | Prisma is fast enough for 90% of operations. Only use Raw SQL for PostGIS matching. |
| **MapEngine Camera Logic** | The reactive binding to viewport changes is high-quality. Only decompose the file. |
| **Smart Import NLP Logic** | The heuristics are working. Moving to LLM is a Phase 2 Growth task. |

**Summary:** We are not building a new app. We are "re-piping" the existing one. By decomposing the monolith files and swapping the storage/sync engines, we reach Tier-1 levels without stopping the feature factory.
