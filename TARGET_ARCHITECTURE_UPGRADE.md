# ARCHITECTURAL UPGRADE PLAN: CeilingsApp V10 → Top-Tier Tier 1

**Автор:** Principal Software Architect / Staff Engineer
**Статус:** Launch Hardening & Scalability Roadmap
**Architecture Score (Текущий):** 7.5/10 (Senior MVP)
**Architecture Score (Целевой):** 9.5/10 (Top-Tier Production)

---

## 1. CURRENT ARCHITECTURE ANALYSIS & LIMITS

### Текущее состояние:
*   **Сильные стороны:** Реактивный `MapEngine`, нормализованный `EntityStore` (предотвращает Inconsistent UI), Room-based WebSocket (гео-сетка), централизованный `RequestRouter` (дедупликация трафика).
*   **Ограничения:**
    *   *Frontend:* `AsyncStorage` блокирует JS-поток при больших JSON (O(N) serialization).
    *   *Backend:* Монолитная структура без явных доменных границ; отсутствие очередей (все события обрабатываются синхронно в HTTP/WS цикле).
    *   *Geo:* Фиксированная сетка 0.1° создаст "hotspot" проблемы в плотной застройке (ЖК).

### Оценка масштабируемости:
*   **10,000 MAU:** Система работает отлично.
*   **100,000 MAU:** Начинаются проблемы с производительностью `AsyncStorage` и лагами на карте при рендере 500+ маркеров. Бэкенд требует вертикального масштабирования.
*   **1,000,000 MAU:** Архитектурный предел. WebSocket сервер упадет от количества соединений без Redis Adapter; PostgreSQL станет узким местом для пространственных запросов без шардирования или оптимизации индексов.

---

## 2. TARGET ARCHITECTURE (THE EVOLUTION)

### Frontend (Feature-Sliced Design Approach):
*   **Structure:** Переход на `src/features/*` (orders, auth, map, chat). Изоляция логики фич от общих компонентов.
*   **State Management:**
    *   *Server State:* `React Query` (TanStack Query) для кэширования API, управления retry и loading states.
    *   *Client State:* `Zustand` (вместо ручного EntityStore) для сверхбыстрых обновлений UI и нативной поддержки селекторов.
*   **Storage:** Замена `AsyncStorage` на **MMKV** (нативное C++ хранилище) — ускорение в 30-50 раз, отсутствие блокировок.

### Backend (Domain-Driven & Event-Driven):
*   **Module Boundaries:** Четкое разделение на `Bounded Contexts`.
*   **Event Bus:** Внедрение `BullMQ` (Redis-based) для асинхронной обработки:
    *   *OrderCreated* → [Push Job, GeoBroadcast Job, Analytics Job].
*   **Caching Layer:** Redis для хранения активных WebSocket сессий и "горячих" заказов.

---

## 3. DOMAIN DRIVEN DESIGN (DDD)

| Домен | Сущности | Ключевые события | Ответственность |
| :--- | :--- | :--- | :--- |
| **Orders** | Order, Application | `OrderPublished`, `OrderClaimed` | Жизненный цикл заказа и матчинг. |
| **Geo** | GeoIndex, Heatmap | `PositionUpdated` | Пространственная индексация и поиск. |
| **Users** | User, Portfolio, Sub | `ProfileUpdated`, `TrialExpired` | Личные данные, рейтинги, доступ. |
| **Comm** | Chat, Message | `MessageSent`, `UserTyping` | Реалтайм общение. |
| **Billing** | Subscription, Tx | `PaymentSuccess` | Монетизация и тарифы. |

---

## 4. EVENT-DRIVEN GEO ARCHITECTURE

### Революция масштабирования:
1.  **MVP (Текущая):** 0.1° Grid Rooms.
2.  **Growth (100k):** Динамические комнаты. Если в одной комнате > 100 мастеров, делим её на 4 под-комнаты.
3.  **Scale (1M+):** Переход на **H3 (Uber Hierarchical Indexing)**. Использование 7-8 разрешения для точного таргетинга уведомлений.

---

## 5. DATA ARCHITECTURE UPGRADE

*   **Local Data:** MMKV для мета-данных, **SQLite (через TypeORM/Expo SQLite)** для архива заказов (позволяет делать сложные SQL запросы в оффлайне).
*   **Server Data:** PostgreSQL остается основным. Добавление **PostGIS** расширения для профессиональной работы с геометрией (ST_DWithin).
*   **Realtime:** Внедрение **Redis Pub/Sub** для горизонтального масштабирования WebSocket серверов (Scale out).

---

## 6. PRODUCTION HARDENING (SECURITY & MONITORING)

*   **Auth Strategy:** Переход на `Access Token (JWT) + Refresh Token (HttpOnly/SecureStore)`. Механизм ротации токенов.
*   **Rate Limiting:** NestJS `ThrottlerModule` с разными лимитами для публичных и приватных эндпоинтов.
*   **Observability:**
    *   *Frontend:* **Sentry** (Crash reporting) + **PostHog** (Product analytics).
    *   *Backend:* **Prometheus + Grafana** для мониторинга RPS, задержек БД и очередей.

---

## 7. MIGRATION PLAN

### Phase 1: Hardening (Сейчас - до 5k MAU)
*   Интеграция **React Query** (Server State).
*   Замена `AsyncStorage` на **MMKV**.
*   Внедрение **Throttler** на бэкенд.
*   Подключение **Sentry**.

### Phase 2: Domain Isolation (10k - 50k MAU)
*   Рефакторинг папок по **FSD (Feature-Sliced Design)**.
*   Внедрение **BullMQ** для фоновых задач (пуши, аналитика).
*   Переход на **Redis Adapter** для Socket.io.

### Phase 3: High Scale (100k+ MAU)
*   Миграция Geo-логики на **PostGIS** + **H3 Indexing**.
*   Шардирование БД или использование **Read Replicas** для тяжелых GET запросов.
*   Внедрение **Micro-services** для доменов Chat и Geo (если потребуется).

---

## 8. CTO VERDICT

1.  **Что сохранить:** Реактивный `MapEngine` (это сердце продукта) и Room-based WS подход. Это дает лучший UX на рынке.
2.  **Что изменить первым:** Уйти от `AsyncStorage` к `MMKV` и внедрить `React Query`. Это уберет 90% "необъяснимых" лагов UI.
3.  **Что нельзя откладывать:** SMS/OTP верификацию и Rate Limiting. Без этого первый же конкурент "заспамит" базу фейковыми заказами.
4.  **Дорогое решение:** Игнорирование PostGIS. Чем позже мы перейдем на нормальные гео-инструменты, тем сложнее будет мигрировать миллионы строк координат из обычных Float полей.

---

### Рекомендация по структуре проекта (FSD):
```text
src/
  app/ (Providers, Navigation)
  features/
    order-creation/
    worker-discovery/ (MapEngine logic)
    chat-messaging/
  entities/ (Order, User models)
  shared/ (UI components, ApiService, MMKV)
```

**Итог:** Текущая система — отличный "скелет". Переход к Tier-1 архитектуре требует не переписывания, а планомерного внедрения инструментов управления состоянием (React Query) и асинхронности (BullMQ/Redis).
