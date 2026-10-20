# 💳 Service Paiement — `payment`

Service responsable des flux de paiement, de la gestion des portefeuilles et de l'exécution du **test de validation post-incident** (*"ça remarche ?"*).

---

## 🎯 Rôle & Responsabilités

1. **Exécution des Paiements** :
   - `POST /payments` : Débit émetteur et crédit destinataire avec vérification du solde.
   - Gestion de l'idempotence (`idempotencyKey`) pour éviter les doubles débits lors des retries réseau.
   - Verrouillage optimiste (`version` dans `wallets`) pour éviter les *race conditions*.
2. **Preuve de Rétablissement (Scénario RESILIENCE-ALPHA)** :
   - `POST /payments/test-validation` : Endpoint déclenché par le moteur de remédiation autonome après neutralisation de l'attaque sur `auth`.
   - Émet une transaction de type `VALIDATION_TEST`.
   - Si la transaction réussit $\rightarrow$ la preuve est enregistrée dans `remediation_logs` et affichée sur le Dashboard (vert).
3. **Consultation des Soldes** :
   - `GET /wallets/:id` : Solde disponible et historique des transactions.
