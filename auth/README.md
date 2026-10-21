# 🛡️ Service Authentification — `@epsi-pay/auth`

Service responsable de la gestion des identités, des sessions sécurisées, et de l'encaissement de l'attaque par force brute dans le scénario **RESILIENCE-ALPHA**.

---

## 🏗️ Architecture Clean Code

```
auth/
├── src/
│   ├── index.ts              # Exports publics du package (@epsi-pay/auth)
│   ├── routes.ts             # Routeur Express & annotations OpenAPI Swagger
│   ├── controller.ts         # Contrôleur HTTP (extraction IP/headers, validation)
│   ├── service.ts            # Logique métier pure (IP check, bcrypt, sessions, ML logs)
│   ├── middleware.ts         # Middleware d'authentification Bearer token (requireAuth)
│   ├── server.ts             # Serveur HTTP autonome (port 3001)
│   └── __tests__/            # Tests automatisés Vitest / Supertest
│       └── auth.test.ts
├── package.json
└── tsconfig.json
```

---

## 📡 Endpoints HTTP Exposés

Toutes les routes sont accessibles directement via l'API Gateway sur `http://localhost:3000/auth/...` (ou sur le service autonome `http://localhost:3001/auth/...`) et documentées dans **Swagger UI (`/docs`)**.

| Méthode | Route | Description | Sécurité & Statuts HTTP |
| :--- | :--- | :--- | :--- |
| **`POST`** | **`/auth/login`** | Authentification par email / mot de passe | • `200 OK` : Jeton Bearer sécurisé de session (24h)<br>• `400 Bad Request` : Données manquantes<br>• `401 Unauthorized` : Mot de passe ou email invalide<br>• `403 Forbidden` : IP bloquée dans `blocked_ips`<br>• `423 Locked` : Compte verrouillé suite à 5 échecs |
| **`POST`** | **`/auth/logout`** | Invalidation de la session active | • `200 OK` : Session révoquée en base<br>• `401 Unauthorized` : Token manquant ou invalide |
| **`GET`** | **`/auth/me`** | Consultation du profil connecté | • `200 OK` : Profil utilisateur (sans mot de passe)<br>• `401 Unauthorized` : Non authentifié |

---

## 🛡️ Résilience & Scénario Red Team (RESILIENCE-ALPHA)

1. **Alimentation du Machine Learning (`login_attempts`)** :
   Chaque tentative (succès ou échec) est immédiatement enregistrée avec l'IP cliente, le User-Agent, le statut et la raison d'échec (`INVALID_CREDENTIALS`, `BRUTE_FORCE_LOCKED`, `IP_BLOCKED`, etc.). Ces données alimentent le modèle de détection d'anomalies de vos camarades.

2. **Protection Active contre le Brute Force** :
   * Chaque échec incrémente `failedLoginAttempts`.
   * Au **5ème échec consécutif**, le compte bascule en `status: LOCKED` avec une temporisation de 15 minutes (`lockedUntil`).
   * Un audit log de sévérité `CRITICAL` est généré pour le SIEM (Wazuh).

3. **Filtrage amont des IP bloquées (`blocked_ips`)** :
   * Dès qu'une IP est ajoutée à la liste noire (par la remédiation automatique ou le WAF), le service rejette immédiatement la requête (`403 Forbidden`) sans solliciter la table des utilisateurs, préservant ainsi les ressources de calcul.

---

## 🧪 Tests Automatisés

```bash
# Exécuter les tests unitaires et d'intégration du service auth
npm run test:auth

# Exécuter l'ensemble des tests du monorepo
npm test
```
