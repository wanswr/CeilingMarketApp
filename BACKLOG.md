# Unified Modernization & Upgrade Backlog

This backlog consolidates all architectural and engineering items across frontend, backend, database, and telemetry to establish a state-of-the-art production system.

---

## 1. Active Backlog & Priorities

| Domain | Task / Goal | Priority | Status | Target Phase | Files Affected |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Storage** | **MMKV Migration & Storage Infrastructure**<br>Replace async storage with synchronous MMKV for zero-lag data hydration. | P0 | **IMPLEMENTED** | Phase 1 (Launch) | `EntityStore.ts`, `StorageService.ts` |
| **State** | **React Query Hybrid Integration**<br>Implement server-state management while piping data into EntityStore for consistency. | P0 | **IMPLEMENTED** | Phase 1 (Launch) | `App.tsx`, `ApiService.ts` |
| **Account** | **App Store Account Deletion Compliance**<br>Implement cascade DB deletes on user, user profile deletion route, settings modal, and delete button. | P0 | **IMPLEMENTED** | Phase 1 (Launch) | `schema.prisma`, `UsersController.ts`, `ProfileScreen.tsx` |
| **Realtime** | **WebSocket Parallel Connect and Deduplication Fixes**<br>Prevent redundant WS reconnections and deduplicate inbound events on clients with TTL. | P0 | **IMPLEMENTED** | Phase 1 (Launch) | `SocketService.ts`, `MapEngine.ts` |
| **Backend** | **Modular Monolith & Event Bus (BullMQ)**<br>Prepare backend for modular Domain-Driven separation and background job queues. | P1 | **IN PROGRESS** | Phase 2 (Growth) | `backend/src/modules/*` |
| **Deduplication** | **Strict Double-Booking Guards**<br>Prevent workers from booking/applying to multiple orders on the same calendar date. | P1 | **IMPLEMENTED** | Phase 1 (Launch) | `OrdersService.ts` |
| **Geo / Scale** | **Uber H3 Spatial Indexing & PostGIS Integration**<br>Migrate to PostGIS and H3 hierarchical spatial indexing for unlimited scale. | P2 | **PLANNED** | Phase 3 (High Scale) | `app.gateway.ts`, `MapEngine.ts` |
| **Render** | **Render Optimization (Memoization)**<br>Shallow comparison on MapScreen markers to prevent redundant re-renders. | P2 | **IMPLEMENTED** | Phase 1 (Launch) | `MapScreen.tsx`, `OrderCard.tsx` |
| **Refactor** | **Feature-Sliced Design (FSD) Refactoring**<br>Restructure source folder into features, entities, and shared boundaries. | P3 | **PLANNED** | Phase 2 (Growth) | Global structures |

---

## 2. Upgrade Architecture Phases

### Phase 1: Hardening (Up to 5k MAU)
- **Completed:** MMKV integration, React Query Server State caching, unified Cross-Platform Logging, cascading DB deletes, and account erasure compliance.
- **Completed:** WebSocket parallel connection locks, TTL event deduplication, and transaction double-click UI protections on maps and orders.
- **Completed:** Strict server-side calendar date double-booking worker protection.

### Phase 2: Domain Isolation (5k - 50k MAU)
- Restructure folder boundaries matching **Feature-Sliced Design (FSD)** logic.
- Integrate **BullMQ** on Redis for background pushes, SMS, and stats/billing jobs.
- Switch to WebSocket Redis adapter for multi-instance gateway support.

### Phase 3: High Scale (100k+ MAU)
- Migrate PostgreSQL float-coordinates to native **PostGIS** geometries (`ST_DWithin` spatial query).
- Move from static viewport grids to Uber's **H3 Hierarchical Hexagonal Spatial Indexing** (resolution 7-8).
- Implement database read-replicas or horizontal partitioning as spatial traffic spikes.

---

## 3. Storage & Scale Diagnostics Summary

- **Local Storage:** MMKV is integrated for fast synchronous writes (30-50x speed increase over AsyncStorage), fully bypassing React Native bridge latency on startup.
- **WebSocket Gateway:** Supports automatic geo-room grid subscriptions to balance background socket payload traffic.
- **Caching & Queue Infrastructure:** BullMQ installed on the backend. Redis Pub/Sub adapter is earmarked for next-step multi-node horizontal WebSocket scale out.
