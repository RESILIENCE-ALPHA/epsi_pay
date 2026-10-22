# EPSI Pay — Frontend

React 19 + TypeScript single-page app, bundled with **Webpack 5 + Babel** (no Vite, no Create React App). Users can sign up, sign in, see their wallets and history, and make a payment.

## How it talks to the API

The browser only calls its own origin. Requests are relayed to the services:

| Browser path      | Forwarded to               |
| ----------------- | -------------------------- |
| `/api/auth/*`     | `auth` service (`/*`)      |
| `/api/payment/*`  | `payment` service (`/*`)   |

- In the Docker image, **nginx** does the relay (`nginx.conf.template`). Targets come from `AUTH_URL` and `PAYMENT_URL` (defaults: `http://auth:3000`, `http://payment:3000`).
- In development, **webpack-dev-server** does it (`webpack.config.js`), targeting `http://localhost:3001` and `http://localhost:3002` by default.

Because everything is same-origin, the NestJS services need no CORS configuration.

## Features

| Page      | API calls                                         |
| --------- | ------------------------------------------------- |
| `/signup` | `POST /signup` (same password rules as `SignupDto`) |
| `/login`  | `POST /login`, then `GET /me` on page reload      |
| `/pay`    | `GET /wallets`, `GET /wallets/:id`, `POST /payments`, `POST /logout` |

- The session token is kept in `sessionStorage` (cleared when the tab closes); a `401` from any call signs the user out.
- Each payment is sent with an `Idempotency-Key`, reused until the form changes, so a double click or a retry after a network error debits only once.
- New accounts start with an empty EUR wallet: pay from a seeded account (password `SEED_USER_PASSWORD`, default `Password123!`) to the new wallet ID to fund it.

## Commands

```bash
npm ci
npm start            # dev server on http://localhost:3000 (needs auth + payment running, e.g. `npm run up` at the root)
npm run typecheck    # tsc --noEmit
npm run build        # production bundle in dist/
```

Docker (build context: `frontend/`):

```bash
docker build -t epsi-pay/frontend ./frontend
docker run -p 8080:8080 -e AUTH_URL=http://auth:3000 -e PAYMENT_URL=http://payment:3000 epsi-pay/frontend
```

The image runs unprivileged nginx on port **8080** and exposes `GET /healthz`.

## Behind a proxy

nginx sets `X-Forwarded-For`. The `auth` service only uses it when `TRUST_PROXY` is set; otherwise every login through the frontend is recorded with nginx's IP, which skews brute-force detection and IP blocking.
