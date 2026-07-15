# TIER-1 ARCHITECTURAL REDESIGN REPORT: CEILINGSAPP (ENTERPRISE SCALE)

**Role:** Principal Architect / CTO
**Target:** 1,000,000+ Active Users, Global Scale
**Current State (V10):** Hardened MVP (Senior Level)

---

## 1. TARGET SYSTEM DESIGN (TIER-1 ARCHITECTURE)

The future of CeilingsApp lies in a **Federated Microservices Architecture** driven by an **Asynchronous Event-Driven Core**.

### High-Level Blueprint:
1.  **Edge Layer:** Multi-region API Gateway (Kong or AWS API Gateway) with Rate Limiting and WAF.
2.  **Service Layer (Microservices):**
    *   **Matching Engine (Rust/Go):** High-performance spatial matcher using H3.
    *   **Order Service (NestJS):** Order lifecycle and business rules.
    *   **Communication Service:** Real-time messaging and WebSocket management.
    *   **Auth & User Service:** IAM, OTP, and profile management.
3.  **Event Layer:** Kafka or RabbitMQ Cluster for inter-service communication.
4.  **Storage Layer:**
    *   **PostgreSQL + PostGIS:** Source of Truth (Spatial data).
    *   **Redis Cluster:** Distributed Cache and WebSocket session store.
    *   **Elasticsearch:** Full-text search and audit logging.

---

## 2. DOMAIN DRIVEN DESIGN (BOUNDED CONTEXTS)

| Context | Responsibility | Key Entities | Domain Events |
| :--- | :--- | :--- | :--- |
| **Matching** | Match worker to order | GeoIndex, MatchPolicy | `WorkerMatched`, `AreaHotspotDetected` |
| **Orders** | Lifecycle management | Order, Application | `OrderCreated`, `OrderFinalized` |
| **Users** | Identity & Trust | Profile, Portfolio | `UserVerified`, `RoleSwitched` |
| **Chat** | Real-time comms | Room, Message | `MessageDelivered`, `UserPresenceChanged` |
| **Payments** | Transactions | Wallet, Payout | `PaymentSecured`, `PayoutInitiated` |
| **Geo** | Spatial Indexing | H3Cell, Grid | `CoordinateUpdated` |

---

## 3. REALTIME & GEO ARCHITECTURE (UBER-SCALE)

### Realtime Scaling (100k+ Connections):
*   **Presence Service:** Use Redis `SET` with TTL to track online users per H3 cell.
*   **WS Horizontal Scale:** Implement **Socket.io Redis Adapter**. Connections are stateless; messages are routed via Redis Pub/Sub to the correct server instance.
*   **Delivery Guarantees:** Sequence IDs and Client-side ACK to handle "at-least-once" delivery.

### Geo Architecture (H3 Indexing):
*   **H3 vs Grid:** Replace 0.1° grid with H3 (Level 7 or 8). H3 provides hexagonal cells that eliminate "edge effects" and simplify distance calculations.
*   **Spatial Matcher:**
    *   `OrderCreated` → Map to H3 Index.
    *   Query Redis for workers in same/neighboring H3 cells.
    *   Push notification via `MatchingEngine`.

---

## 4. DATA ARCHITECTURE & STORAGE

### Mobile (Offline-First V2):
*   **MMKV:** Replaces `AsyncStorage` for meta-data (10x faster).
*   **SQLite (Expo SQLite):** Relational store for orders history (supports SQL queries on local data).
*   **Sync Engine:** Implementation of a **Write-Ahead Log (WAL)** on the client to sync local changes once the network returns.

### Backend:
*   **Primary Database:** PostgreSQL with **TimescaleDB** extension for order history and **PostGIS** for spatial accuracy.
*   **Speed:** Redis for Hot Data (Active Orders) and idempotency keys.

---

## 5. AI / NLP ARCHITECTURE (SMART IMPORT 2.0)

Current Regex parser → **NLP Pipeline**:
1.  **LLM Sanitization:** Use a small self-hosted model (e.g., Llama-3 or Mistral) to extract entities from raw text.
2.  **Confidence Scoring:** Each field gets a `score [0-1]`.
3.  **Human-in-the-loop:** If `score < 0.8`, the "Create Order" screen forces manual verification of the field.
4.  **Feedback Loop:** User corrections are stored to fine-tune the model periodically.

---

## 6. OBSERVABILITY & SECURITY

### Observability Stack:
*   **Traces:** OpenTelemetry + Jaeger (to see why a specific order matching was slow).
*   **Metrics:** Prometheus + Grafana (RPS, Latency, WebSocket connection count).
*   **Analytics:** Segment or PostHog for user behavior and conversion funnels.

### Security Hardening:
*   **Auth:** 2FA/OTP as default. Device fingerprinting to detect fraudulent multiple accounts.
*   **Rate Limiting:** IP-based and User-based sliding window limits at the Gateway level.
*   **Data Residency:** Comply with local laws (e.g., 152-FZ) by localizing PII data storage.

---

## 7. MIGRATION MAP & CTO VERDICT

### What to Keep from V10:
*   **Reactive Map Logic:** The hook-based camera tracking is solid.
*   **EntityStore Logic:** Keep the normalization principles, but migrate the implementation.

### MIGRATION PATH:

| Current File (V10) | Target Path (Tier-1) | Action |
| :--- | :--- | :--- |
| `EntityStore.ts` | `src/features/store/mmkv-adapter` | Replace `AsyncStorage` with MMKV. |
| `OrdersService.ts` | `backend/src/microservices/orders` | Split into Order Service and Matching Service. |
| `AppGateway.ts` | `backend/src/microservices/gateway` | Migrate to Redis Adapter and separate room logic. |
| `orders.controller.ts` | `backend/src/api-gateway` | Move to Gateway layer with Rate Limiting. |
| `Prisma Schema` | `infrastructure/database/postgis` | Add PostGIS extensions and H3 indexing fields. |

### CTO Verdict:
To compete with **Uber** or **Avito**, we must move from "Request-Response" to "Event-Driven".
1.  **Priority 1:** Replace `AsyncStorage` with **MMKV** and `Image` with **FastImage**.
2.  **Priority 2:** Introduce **RabbitMQ/Kafka** to decouple Orders from Notifications.
3.  **Priority 3:** Migrate Spatial logic to **H3**.

**Final Vision:** CeilingsApp should be a system where the "Order" isn't a row in a table, but a **state machine** flowing through a network of specialized services.
