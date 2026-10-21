# 💳 Payment Service — `payment`

Service responsible for payment flows, wallet management and running the **post-incident validation test** (*"does it work again?"*).

---

## 🎯 Role & Responsibilities

1. **Payment Execution**:
   - `POST /payments`: debits the sender and credits the receiver, with a balance check.
   - Idempotency handling (`idempotencyKey`) to avoid double debits on network retries.
   - Optimistic locking (`version` in `wallets`) to avoid *race conditions*.
2. **Proof of Recovery (RESILIENCE-ALPHA Scenario)**:
   - `POST /payments/test-validation`: endpoint triggered by the autonomous remediation engine once the attack on `auth` has been neutralized.
   - Issues a `VALIDATION_TEST` transaction.
   - If the transaction succeeds $\rightarrow$ the proof is recorded in `remediation_logs` and shown on the Dashboard (green).
3. **Balance Lookup**:
   - `GET /wallets/:id`: available balance and transaction history.

---

## 🔌 API

Full specification: [`openapi.yaml`](./openapi.yaml), served as Swagger UI on `/docs` (JSON on `/docs-json`).

User routes require a token issued by the `auth` service (`Authorization: Bearer <token>`), checked against the shared `sessions` table.

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/payments` | Body `{ senderWalletId, receiverWalletId, amount, description? }`, optional `Idempotency-Key` header. The sender wallet must belong to the user. Codes: `422` insufficient funds / inactive wallet / currency mismatch, `409` concurrent update (retry) or idempotency key already used by another user. |
| `GET` | `/wallets` | Wallets of the logged-in user. |
| `GET` | `/wallets/:id` | Balance and last 20 transactions (owner or `ADMIN`). |
| `POST` | `/payments/test-validation` | Internal route, header `X-Internal-Token: $INTERNAL_API_TOKEN`. Credits €0.01 to the system wallet (`VALIDATION_TEST` transaction). With `{ "incidentId" }`, records the `TEST_PAYMENT_VERIFIED` proof in `remediation_logs`. |
| `GET` | `/health` | Status of the service and the database. |

Example with fake values:

```bash
curl -X POST http://localhost:3002/payments -H 'Authorization: Bearer fake-access-token-0000' \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: fake-idempotency-key-0001' \
  -d '{ "senderWalletId": "00000000-0000-0000-0000-000000000001", "receiverWalletId": "00000000-0000-0000-0000-000000000002", "amount": 10.5 }'
curl -X POST http://localhost:3002/payments/test-validation -H 'X-Internal-Token: fake-internal-token-0000'
```

## ⚙️ Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `DB_PORT`: `5432` | PostgreSQL connection (shared database). |
| `PORT` | `3000` | HTTP port. |
| `INTERNAL_API_TOKEN` | *(empty)* | Remediation engine secret. Empty = `test-validation` disabled (`403`). |
| `SYSTEM_BOT_EMAIL` | `system-bot@epsi-pay.internal` | Account whose wallet receives the validation payments. |
| `TRUST_PROXY` | *(empty)* | Behind APISIX: number of proxies or trusted CIDR for `X-Forwarded-For`. |

## 🚀 Running

NestJS service; the image is built from the repository root (the Prisma schema is read from `database/prisma/`):

```bash
# With Docker Compose (port 3002)
docker compose up -d --build payment

# Locally
npm ci && npm run prisma:generate
npm run start:dev
```
