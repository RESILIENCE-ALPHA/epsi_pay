# EPSI Pay — Plateforme de Paiement Résiliente (PROJECT RESILIENCE-ALPHA)

Application de paiement conçue pour démontrer la haute résilience, la détection d'anomalies par Machine Learning et la remédiation autonome face à des cyberattaques.

---

## 🏗️ Architecture du Projet

Le projet est structuré en services découplés à la racine, orchestrés par un Docker Compose unique :

```
epsi_pay/
├── docker-compose.yml       # Orchestration locale (PostgreSQL 15, Auth, Payment)
├── package.json             # Scripts de développement et commandes DB
│
├── database/                # 🗄️ Service Persistance & Données
│   ├── prisma/              # Schéma Prisma & scripts de Seed
│   └── README.md            # 📖 Dictionnaire de Données Officiel (Complet)
│
├── auth/                    # 🛡️ Service Authentification & Sessions
│   └── README.md            # Cible de l'attaque Brute Force (PC Attaquant)
│
└── payment/                 # 💳 Service Paiements & Portefeuilles
    └── README.md            # Exécution du test de reprise post-remédiation
```

---

## 🛠️ Stack Technique

- **Runtime** : Node.js 22 LTS (via `.nvmrc`)
- **Langage** : TypeScript 5+
- **SGBD** : PostgreSQL 15 (Docker)
- **ORM** : Prisma ORM v6

---

## 📖 Dictionnaire de Données

Le **dictionnaire de données complet** avec toutes les tables, colonnes, contraintes, rôles dans l'attaque brute force et conformités (NIS2 / DORA) est consultable directement dans :
👉 [**Consulter le Dictionnaire de Données (`database/README.md`)**](./database/README.md)

---

## 🚀 Commandes Rapides

### ⚡ Initialisation en une seule commande (Recommandé)
Lance PostgreSQL 15, applique le schéma Prisma et injecte les **10 000+ données** immédiatement :
```bash
npm run db:setup
```

---

### Commandes détaillées pas-à-pas :

1. **Démarrer PostgreSQL 15 (Docker) :**
   ```bash
   npm run db:up
   ```

2. **Synchroniser le schéma Prisma :**
   ```bash
   npm run prisma:push
   ```

3. **Générer le jeu de données massif (10k entrées) :**
   ```bash
   npm run db:seed:10k
   ```
   *(Ou `npm run db:seed` pour le jeu de données minimal de 3 comptes).*

### 4. Visualiser les données (Prisma Studio)
```bash
npm run prisma:studio
```
Accédez à l'interface sur `http://localhost:5555`.

### 5. Arrêter la base de données
```bash
npm run db:down
```
