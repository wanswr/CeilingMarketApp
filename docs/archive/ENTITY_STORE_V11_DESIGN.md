# ARCHITECTURAL SPECIFICATION: EntityStore V11 (Tier-1 Scale)

**Author:** Principal Frontend Architect
**Project:** CeilingsApp
**Target:** 1,000,000+ Users, Real-time Marketplace

---

## 1. RESPONSIBILITIES (The Bounded Context)

EntityStore V11 transitions from a simple "state manager" to a **Normalized Canonical Cache (NCC)**.

### What it STORES (Business Entities):
*   **Orders:** Full lifecycle (discovery, matching, active, history).
*   **Users:** Profiles, ratings, and social metadata.
*   **Chats:** Message threads, delivery statuses, and local participation state.
*   **Applications:** Executor bids and employer decisions.
*   **Metadata:** Last sync timestamps, sequence IDs, and spatial index keys.

### What it DOES NOT STORE:
*   **UI State:** Search bar text, modal visibility, current navigation route (delegate to **Zustand**).
*   **Transient Request State:** `isLoading`, `isError`, `error` message (delegate to **React Query**).
*   **Form Drafts:** Data before submission (delegate to local screen state).

---

## 2. HYBRID INTERACTION ARCHITECTURE

EntityStore acts as the central hub between network, real-time, and persistent layers.

| Component | Interaction Type | Role |
| :--- | :--- | :--- |
| **React Query** | Uni-directional Push | Network fetcher. On success, it calls `EntityStore.merge(data)`. |
| **WebSocket** | High-priority Stream | Delta-pusher. Updates specific fields (e.g., `status`, `lastMessage`) via atomic transactions. |
| **MMKV** | Index & Fast Buffer | Persists the "Hot" index (Entity IDs + Status) for instant app launch (< 50ms). |
| **SQLite** | Heavy Relational Data | History storage (e.g., 2 years of chat logs). EntityStore pulls from SQLite via Paging. |

---

## 3. REALTIME FLOW (The Pipeline)

**Scenario: OrderUpdated (Status Changed)**

1.  **Ingress:** WebSocket receives `{ type: 'ORDER_UPDATED', payload: { id: '...', status: 'CLAIMED' }, seq: 452 }`.
2.  **Deduplication:** `RequestRouter` checks for `seq` ID and event idempotency key.
3.  **Atomic Upsert:** `EntityStore.upsert('order', payload)`:
    *   Finds existing entity by ID.
    *   Performs shallow-equality check (prevents bridge spam).
    *   Merges delta update.
4.  **UI Notification:** Trigger stable reference change → React components re-render only the affected UI fragment.

---

## 4. OFFLINE & CONFLICT RESOLUTION (The WAL Pattern)

EntityStore V11 implements a **Write-Ahead Log (WAL)** for reliability.

*   **Local Action:** User clicks "Apply".
*   **Outbox:** Action is added to MMKV Outbox with a local UUID.
*   **Optimistic UI:** EntityStore updates the order status locally to "Applying...".
*   **Reconnect Sync:** On internet restoration, `syncAfterReconnect` fetches events since `lastSyncTime`.
*   **Conflict Resolution:**
    *   If Server says "Order Taken", EntityStore rolls back the optimistic change and triggers a "Order no longer available" toast.
    *   "Server-Wins" is the default strategy for status transitions.

---

## 5. MEMORY & PERFORMANCE MANAGEMENT

To handle **100k+ Orders**, we use **Spatial Virtualization**.

### Strategies:
*   **Spatial Eviction:** Only entities within a 100km radius of the user (or active view) are kept "Hot" in JS memory.
*   **LRU (Least Recently Used):** Historically viewed profiles or old completed orders are flushed from JS memory but kept in SQLite.
*   **Serialization Optimization:** EntityStore uses **JSON-patch** for updates to avoid full stringify/parse cycles.

---

## 6. CACHE INVALIDATION

1.  **TTL (Time-To-Live):**
    *   Active Orders: 30 minutes.
    *   Static Profiles: 24 hours.
2.  **Explicit Eviction:**
    *   `Order.Deleted` event → Immediate removal from Memory and Index.
3.  **Memory Pressure:** If JS heap exceeds 50MB, the store automatically evicts the bottom 20% of LRU entities.

---

## 7. ARCHITECTURAL SCHEMA (Tier-1)

```text
       [ UI COMPONENTS ]
               ↕
        [ ZUSTAND (UI) ]
               ↕
[ REACT QUERY ] ↔ [ ENTITY STORE (V11) ] ↔ [ WEBSOCKET ]
               ↕           ↕
       [ API GATEWAY ] ↔ [ MMKV (Indexes) ]
                           ↕
                     [ SQLite (Data) ]
```

---

## 8. FINAL VERDICT (The 12-Month Vision)

If CeilingsApp is a **$100M product**, EntityStore V11 must be a **Distributed Database Engine** within the client.

By June 2027, the EntityStore will:
1.  **Self-Heal:** Automatically detect and fix data corruption in the local SQLite file.
2.  **Predictive Fetch:** Use a simple heuristic (or light ML) to pre-load orders in the direction the user is panning the map.
3.  **Encrypted-at-Rest:** Store all private User/Chat data in an encrypted SQLite segment, meeting 152-FZ and GDPR requirements.

**Conclusion:** EntityStore V11 is no longer just a "store" — it is the **Data Persistence and Synchronization Core** that makes the app feel "instant" regardless of network conditions.
