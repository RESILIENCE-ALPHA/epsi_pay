import { browserSupportsWebAuthn, WebAuthnError } from '@simplewebauthn/browser';

// Passkeys (WebAuthn) : l'empreinte digitale ou le visage est vérifié par l'appareil (Touch ID, Face ID,
// Windows Hello, Android). Le navigateur ne transmet qu'une signature : aucune donnée biométrique ne sort.

/** WebAuthn disponible : navigateur compatible et page servie en HTTPS (ou sur localhost) */
export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn() && (typeof window === 'undefined' || window.isSecureContext !== false);
}

/** Message pour une erreur levée par le navigateur pendant la demande d'empreinte/visage, null sinon */
export function describePasskeyPromptError(error: unknown): string | null {
  if (error instanceof WebAuthnError) {
    switch (error.code) {
      case 'ERROR_CEREMONY_ABORTED':
        return 'Validation annulée.';
      case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
        return 'Cet appareil est déjà enregistré sur votre compte.';
      case 'ERROR_INVALID_DOMAIN':
      case 'ERROR_INVALID_RP_ID':
        return 'Les passkeys ne fonctionnent qu’en HTTPS sur le domaine officiel d’EPSI Pay.';
      case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
      case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
        return 'Cet appareil ne permet pas la vérification par empreinte ou visage.';
      default:
        return 'L’appareil n’a pas pu valider votre identité. Réessayez.';
    }
  }
  if (error instanceof DOMException) {
    // NotAllowedError : fenêtre fermée, délai dépassé ou empreinte/visage refusé
    return error.name === 'NotAllowedError'
      ? 'Validation annulée ou expirée. Réessayez.'
      : 'L’appareil n’a pas pu valider votre identité. Réessayez.';
  }
  return null;
}
