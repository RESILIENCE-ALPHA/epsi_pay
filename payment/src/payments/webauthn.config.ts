// Paramètres WebAuthn, identiques dans auth et payment (mêmes variables d'environnement).
// WEBAUTHN_RP_ID : domaine auquel les passkeys sont liées (sans schéma ni port). Il doit être le domaine
// du front ou un de ses parents, et ne peut plus changer sans réenregistrer toutes les passkeys.
// WEBAUTHN_ORIGINS : origines exactes du front (schéma + hôte + port), séparées par des virgules.
// Les navigateurs n'autorisent WebAuthn qu'en HTTPS, sauf sur localhost.
export const webauthnConfig = {
  rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
  rpName: process.env.WEBAUTHN_RP_NAME ?? 'EPSI Pay',
  origins: (process.env.WEBAUTHN_ORIGINS ?? 'http://localhost:5173,http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  challengeTtlMs: 5 * 60_000,
};
