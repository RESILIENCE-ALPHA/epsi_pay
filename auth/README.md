# 🛡️ Service Authentification — `auth`

Service responsable de la gestion des identités, des sessions, et de l'encaissement de l'attaque par force brute dans le scénario **RESILIENCE-ALPHA**.

---

## 🎯 Rôle & Responsabilités

1. **Authentification & Sessions** :
   - `POST /login` : Vérification des identifiants (email / mot de passe).
   - Gestion des tokens / sessions.
   - Journalisation de chaque tentative dans `login_attempts` pour alimenter le modèle de **Machine Learning**.
2. **Cloisonnement & Résilience** :
   - Service indépendant : s'il sature sous l'effet de l'attaque Red Team (brute force), les services de paiement restent disponibles.
   - Cible du moteur de **remédiation automatique** (relance du service `auth` et application de la liste noire `blocked_ips`).
3. **Sécurité** :
   - Vérification préalable de l'adresse IP cliente dans la table `blocked_ips`.
   - Verrouillage temporaire des comptes après échecs répétés.
