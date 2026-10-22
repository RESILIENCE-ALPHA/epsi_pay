# 🛡️ Authentication Service — `auth`

Service responsible for identities and sessions, and for absorbing the brute force attack in the **RESILIENCE-ALPHA** scenario.

---

## 🎯 Role & Responsibilities

1. **Authentication & Sessions**:
   - `POST /login`: checks the credentials (email / password).
   - Token / session management.
   - Logs every attempt in `login_attempts` to feed the **Machine Learning** model.
2. **Isolation & Resilience**:
   - Independent service: if it saturates under the Red Team attack (brute force), the payment services stay available.
   - Target of the **automatic remediation** engine (restart of the `auth` service and enforcement of the `blocked_ips` blacklist).
3. **Security**:
   - Checks the client IP address against the `blocked_ips` table first.
   - Temporarily locks accounts after repeated failures.

---

## 🔌 API

Full specification: [`openapi.yaml`](./openapi.yaml), served as Swagger UI on `/docs` (JSON on `/docs-json`).

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/signup` | Body `{ "email", "password", "name"? }`. Creates an active `CLIENT` account and an empty EUR wallet. Password: 12 to 72 characters, with a lowercase letter, an uppercase letter and a digit. Codes: `409` email already used, `403` IP blocked. |
| `POST` | `/login` | Body `{ "email", "password" }`. Returns `{ accessToken, expiresAt, user }`. Codes: `401` invalid credentials, `403` IP blocked, `423` account locked. |
| `GET` | `/me` | Header `Authorization: Bearer <token>`. User of the session. |
| `POST` | `/logout` | Revokes the token's session. |
| `GET` | `/health` | Status of the service and the database. |

Every attempt is recorded in `login_attempts` (`failureReason`: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `IP_BLOCKED`).
After `MAX_FAILED_ATTEMPTS` failures, the account switches to `LOCKED` for `LOCK_DURATION_MINUTES` and its sessions are revoked.
The token is never stored in plain text: only its SHA-256 hash is saved in `sessions.tokenHash`.

Example with fake values:

```bash
curl -X POST http://localhost:3001/signup -H 'Content-Type: application/json' \
  -d '{ "email": "jane.doe@example.com", "password": "FakePassw0rd-Example", "name": "Jane Doe" }'
curl -X POST http://localhost:3001/login -H 'Content-Type: application/json' \
  -d '{ "email": "jane.doe@example.com", "password": "FakePassw0rd-Example" }'
curl http://localhost:3001/me -H 'Authorization: Bearer fake-access-token-0000'
```

## ⚙️ Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `DB_PORT`: `5432` | PostgreSQL connection (shared database). |
| `PORT` | `3000` | HTTP port. |
| `MAX_FAILED_ATTEMPTS` | `5` | Consecutive failures before locking. |
| `LOCK_DURATION_MINUTES` | `15` | Duration of the automatic lock. |
| `SESSION_TTL_MINUTES` | `60` | Session lifetime. |
| `TRUST_PROXY` | `1` | Number of proxies or trusted CIDR used to read the real IP from `X-Forwarded-For`. `1` = the frontend's nginx; use `2` if APISIX is in front of it; empty = disabled. |

## 🚀 Running

NestJS service; the image is built from the repository root (the Prisma schema is read from `database/prisma/`):

```bash
# With Docker Compose (port 3001)
docker compose up -d --build auth

# Locally
npm ci && npm run prisma:generate
npm run start:dev
```
