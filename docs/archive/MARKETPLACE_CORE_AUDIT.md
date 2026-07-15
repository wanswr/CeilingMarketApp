# 🛡️ CeilingsApp: Marketplace Core Technical Audit

**Scope**: Order Lifecycle, WebSocket, Map Engine, Frontend State, Backend Logic, Database, Chats.
**Excluded**: Auth, SMS, Push, App Store requirements.

---

## 🛑 P0: Critical (Fix before first testers)

### 1. WebSocket: Global Broadcast Scalability Risk
- **Problem**: `OrdersService` uses `this.gateway.broadcast` for order status changes and new applications.
- **Risk**: Every connected user receives updates for every order in the system. This will cause exponential traffic growth and UI performance degradation as the user base grows.
- **Scenario**: A user in Moscow starts an order, and a user in Berlin receives a WebSocket event and potentially triggers a store update/re-render.
- **Action**: Switch to room-based emits (`to(geoRoom)` or `to(userId)`).

### 2. Order Flow: Missing Status Guards in Service
- **Problem**: `startWork` and `completeWork` in `OrdersService` only verify the `executorId`. They do not check if the current status is valid for the transition.
- `startWork` should require status `CLAIMED`.
- `completeWork` should require status `IN_PROGRESS`.
- **Risk**: Orders can be moved to `IN_PROGRESS` from `CANCELLED` or `COMPLETED`, breaking business logic and reporting.
- **Scenario**: A master clicks "Start" on an old order that was already cancelled by the employer.

### 3. Data Integrity: Reconciliation Data Loss
- **Problem**: `EntityStore.setOrders` (used for reconciliation) removes local orders that are not present in the incoming list.
- **Risk**: If a user is on the Map tab and the spatial query returns a filtered list (e.g., top 1000 or specific region), orders that the user is participating in (found in "My Orders") might be deleted from the local store if they aren't in that spatial slice.
- **Scenario**: User has an active order in one city, scrolls the map to another city. The active order is "reconciled" away.

---

## ⚠️ P1: Important (Fix after first users)

### 1. WebSocket: No Event Deduplication
- **Problem**: `SocketService` and `EntityStore` have placeholders for `eventId` deduplication, but the backend does not currently send a unique `eventId` with each message.
- **Risk**: Duplicate UI updates or "jumping" markers during network instability (reconnect bursts).

### 2. Map: Spatial Fetch Payload Size
- **Problem**: `findSpatial` returns up to 1000 full Order objects.
- **Risk**: High memory usage and parsing time on mobile devices. A dense area will return a multi-megabyte JSON.
- **Action**: Implement "Thin" objects for map view (ID, coords, price, status only) and fetch full details only when selected.

### 3. Order Flow: 409 Conflict UX
- **Problem**: While the database is protected by unique constraints and transactions, the frontend lacks specific handling for `409 Conflict` errors (e.g., when two masters are accepted for the same job).
- **Risk**: User sees a generic "Error" or nothing happens, leading to frustration.

---

## 💡 P2: Improvements (Backlog)

### 1. Database: Review Status implemention
- **Suggestion**: Add `PARTIALLY_REVIEWED` and `REVIEWED` statuses to the Prisma schema. Currently, these only exist in the frontend's priority logic. Having them in the DB simplifies filtering for "Orders needing my attention".

### 2. Map: BBOX Caching
- **Suggestion**: Optimize `RequestRouter` to check if the new viewport is fully contained within a previously fetched (and still valid) bounding box to reduce API calls during small pans.

---
*Audit conducted by Jules (Senior Software Engineer)*
