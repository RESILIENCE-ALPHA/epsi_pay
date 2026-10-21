import { Request, Response } from 'express';
import { login, logout } from './service';
import { AuthenticatedRequest } from './middleware';

/**
 * Extrait l'adresse IP cliente réelle même derrière un proxy/reverse proxy
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Endpoint POST /auth/login
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body || {};
  const ipAddress = extractClientIp(req);
  const userAgent = req.headers['user-agent'];

  const result = await login({
    email,
    password,
    ipAddress,
    userAgent,
  });

  res.status(result.status).json(result);
}

/**
 * Endpoint POST /auth/logout
 */
export async function logoutHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  await logout(req.token);
  res.status(200).json({
    message: 'Déconnexion réussie. La session a été invalidée.',
  });
}

/**
 * Endpoint GET /auth/me
 */
export async function getMeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  res.status(200).json({
    user: req.user,
  });
}
