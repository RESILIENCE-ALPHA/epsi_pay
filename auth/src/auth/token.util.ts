import { createHash, randomBytes } from 'crypto';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Seule l'empreinte du jeton est stockée en base (sessions.tokenHash)
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function extractBearerToken(authorization?: string): string | null {
  const [scheme, token] = authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
