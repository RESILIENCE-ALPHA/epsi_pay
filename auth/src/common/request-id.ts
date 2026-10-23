import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Identifiant reçu d'un proxy (nginx $request_id, plugin request-id d'APISIX) gardé s'il est bien formé,
// sinon régénéré : un client ne peut pas injecter n'importe quoi dans les logs
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

type TracedRequest = Request & { requestId: string; user?: { id: string; sessionId?: string } };

// Attribue un X-Request-Id à chaque requête, le renvoie au client et écrit une ligne de log JSON (lue par Promtail/Loki).
// Rien n'est enregistré en base : l'identifiant n'existe que dans la réponse et les logs
export function requestIdMiddleware(service: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const traced = req as TracedRequest;
    const incoming = req.header('x-request-id');
    traced.requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', traced.requestId);

    const startedAt = performance.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level,
          service,
          requestId: traced.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
          ip: req.ip,
          userId: traced.user?.id,
          sessionId: traced.user?.sessionId,
        }),
      );
    });
    next();
  };
}
