# EPSI Pay — Resilient Payment Platform (PROJECT RESILIENCE-ALPHA)

Payment application built to demonstrate high resilience, Machine Learning anomaly detection and autonomous remediation against cyberattacks.

---

## 🏗️ Project Architecture

The project is split into microservices in a single repository. Each service has its own `package.json` and `Dockerfile`, and all of them share **a single PostgreSQL database**. There is one Prisma schema, in `database/prisma/schema.prisma`; `auth` and `payment` generate their Prisma client from that file.

```text
epsi_pay/
├── docker-compose.yml       # Local orchestration: postgres → database (seed) → auth + payment
├── package.json             # Orchestration scripts (no dependencies)
│
├── database/                # 🗄️ Seeder: applies the schema, loads the data, then exits
│   ├── prisma/              # Prisma schema (single source) & seed scripts
│   ├── Dockerfile
│   └── README.md            # 📖 Official Data Dictionary (complete)
│
├── auth/                    # 🛡️ NestJS Authentication & Sessions service (port 3001)
│   ├── src/
│   └── Dockerfile           # Target of the Brute Force attack (Attacker PC)
│
└── payment/                 # 💳 NestJS Payments & Wallets service (port 3002)
    ├── src/
    └── Dockerfile           # Runs the post-remediation recovery test
```

Startup order (Docker Compose):

1. `postgres` starts and becomes *healthy*.
2. `database` runs `prisma db push` then the seed, and **exits** (code 0).
3. `auth` and `payment` start once the seeder has completed successfully.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 22 LTS (via `.nvmrc`)
- **Language**: TypeScript
- **Framework**: NestJS 12 (`auth`, `payment`)
- **DBMS**: PostgreSQL 15 (Docker)
- **ORM**: Prisma ORM v6

---

## 📖 Data Dictionary

The **complete data dictionary**, with every table, column, constraint, role in the brute force attack and compliance (NIS2 / DORA), is available in:
👉 [**Read the Data Dictionary (`database/README.md`)**](./database/README.md)

---

## 🚀 Quick Commands

### ⚡ Run everything (recommended)

Builds the images, starts PostgreSQL, runs the seeder (10,000+ records), then starts `auth` and `payment`:

```bash
npm run up
```

- Auth: `http://localhost:3001` (`POST /signup`, `POST /login`, `GET /me`, `POST /logout`, `GET /health`)
- Payment: `http://localhost:3002` (`POST /payments`, `GET /wallets`, `GET /wallets/:id`, `GET /health`)
- All seeded accounts use the password `Password123!` (variable `SEED_USER_PASSWORD`).

To enable `POST /payments/test-validation`, set a secret before starting: `INTERNAL_API_TOKEN=... npm run up`.

Swagger UI: `http://localhost:3001/docs` (auth) and `http://localhost:3002/docs` (payment). The specs are maintained in [`auth/openapi.yaml`](./auth/openapi.yaml) and [`payment/openapi.yaml`](./payment/openapi.yaml).

### Detailed commands

```bash
npm run db:up          # Start PostgreSQL 15 only
npm run db:seed        # (Re)run the seeder (exits when done)
SEED_SCRIPT=seed npm run db:seed   # Minimal dataset (⚠️ empties the tables before inserting)
npm run logs           # Follow the auth and payment logs
npm run down           # Stop everything
```

### Local development (without Docker)

```bash
npm run install:all    # Installs the dependencies of the 3 services and generates the Prisma clients
npm run prisma:push    # Syncs the schema with the database (DATABASE_URL)
npm --prefix auth run start:dev
npm --prefix payment run start:dev
```

After changing `database/prisma/schema.prisma`, run `npm run prisma:generate` again.

### Browse the data (Prisma Studio)

```bash
npm run prisma:studio
```

Open the interface at `http://localhost:5555`.
