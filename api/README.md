# 🌐 Service API — EPSI Pay

Ce répertoire héberge le service HTTP central de la plateforme **EPSI Pay** dans le cadre du projet **RESILIENCE-ALPHA**.
Il est développé selon les principes du **Clean Code** et de la responsabilité unique (**SRP** - Single Responsibility Principle).

---

## 🏗️ Architecture & Découpage

```
api/
├── src/
│   ├── app.ts            # Configuration Express, middlewares et routes (testable isolément)
│   ├── server.ts         # Cycle de vie HTTP, écoute réseau et Graceful Shutdown
│   └── __tests__/        # Tests d'intégration et de résilience (Vitest + Supertest)
│       └── api.test.ts
├── Dockerfile            # Image multi-stage Node 22 Alpine (sécurisée non-root)
└── README.md
```

### Principes Clean Code appliqués
- **Séparation App vs Server** : `app.ts` instancie et configure Express sans ouvrir de socket réseau. Cela permet d'exécuter l'intégralité de la suite de tests en mémoire sans conflit de port.
- **Cycle de vie & Arrêt gracieux (Graceful Shutdown)** : `server.ts` intercepte les signaux `SIGTERM` et `SIGINT` (émis par Kubernetes et Docker Compose), stoppe la réception de nouvelles requêtes, libère le pool de connexions Prisma et s'arrête proprement.
- **Résilience** : La sonde `/health` interroge la base de données. Si la base est injoignable, l'API répond un statut HTTP `503 Service Unavailable` avec un rapport d'état dégradé sans faire crasher le processus Node.js.

---

## 📡 Endpoints Disponibles

| Méthode | Route | Description | Statut nominal | Statut dégradé |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Métadonnées du service (nom, statut, version, timestamp) | `200 OK` | - |
| `GET` | `/health` | Sonde de santé applicative & vérification connectivité PostgreSQL | `200 OK` | `503 Service Unavailable` |

### Exemple de réponse `GET /`
```json
{
  "service": "epsi-pay-api",
  "status": "operational",
  "version": "1.0.0",
  "description": "Plateforme de paiement résiliente - Project RESILIENCE-ALPHA",
  "timestamp": "2026-10-20T10:50:00.000Z"
}
```

### Exemple de réponse `GET /health` (Opérationnel)
```json
{
  "status": "healthy",
  "uptime": 42.15,
  "timestamp": "2026-10-20T10:50:00.000Z",
  "checks": {
    "database": "up"
  }
}
```

### Exemple de réponse `GET /health` (Dégradé si DB coupée)
```json
{
  "status": "degraded",
  "uptime": 42.15,
  "timestamp": "2026-10-20T10:50:00.000Z",
  "checks": {
    "database": "down",
    "error": "Connection refused to postgres:5432"
  }
}
```

---

## 🧪 Tests

Les tests automatisés sont propulsés par **Vitest** et **Supertest** :

```bash
# Exécution de la suite de tests de l'API
npm run test:api

# Exécution de tous les tests du projet
npm test
```

---

## 🐳 Conteneurisation & Déploiement

### Construction de l'image Docker locale
```bash
docker build -t epsi-pay-api -f api/Dockerfile .
```

### Démarrage avec Docker Compose
Le service `api` est directement intégré à l'orchestration Docker Compose :
```bash
docker compose up -d --build
```
L'API démarre automatiquement une fois la base de données PostgreSQL prête et déclarée *healthy*.
