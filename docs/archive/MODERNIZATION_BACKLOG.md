# MODERNIZATION BACKLOG: CEILINGSAPP TIER-1

| Task | Priority | Impact | Risk | Files Affected |
| :--- | :--- | :--- | :--- | :--- |
| **MMKV Migration** | P0 | High | Low | `EntityStore.ts`, `SpatialManager.ts`, `ProfileScreen.tsx` |
| **React Query Integration** | P0 | High | Medium | `App.tsx`, `ApiService.ts`, New Hooks |
| **EntityStore V11 Foundation** | P1 | High | Medium | `EntityStore.ts` |
| **Socket Hardening (Redis)** | P1 | Medium | High | `app.gateway.ts`, `SocketService.ts` |
| **Modular Monolith Setup** | P1 | Medium | Low | `backend/src/modules/*` |
| **BullMQ Integration** | P2 | Medium | Medium | `OrdersService.ts`, New Workers |
| **Render Optimization (Memo)** | P2 | Medium | Low | `MapScreen.tsx`, `OrderCard.tsx` |
| **FSD Refactoring** | P3 | Low | High | Global structure |

---

## PR-001: MMKV Migration & Storage Infrastructure
**Goal:** Replace asynchronous AsyncStorage with synchronous MMKV for zero-lag data hydration.
**Status:** IMPLEMENTED

## PR-002: React Query Hybrid Integration
**Goal:** Implement server-state management while piping data into EntityStore for consistency.
**Status:** IMPLEMENTED

## PR-003: Modular Monolith & Event Bus (BullMQ)
**Goal:** Prepare backend for scalability and async background jobs.
**Status:** IN PROGRESS (Setup phase)
