import express, { Express, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { prisma } from '@epsi-pay/database';
import { swaggerSpec } from './swagger';

export const app: Express = express();

// Middlewares fondamentaux
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Documentation interactive Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'EPSI Pay — API Documentation',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
  },
}));

// Expose la spécification OpenAPI brute en JSON
app.get('/docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @openapi
 * /:
 *   get:
 *     summary: Informations générales du service
 *     description: Retourne les métadonnées du service API (nom, version, statut opérationnel).
 *     tags:
 *       - Système
 *     responses:
 *       200:
 *         description: Service opérationnel
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceInfo'
 */
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'epsi-pay-api',
    status: 'operational',
    version: '1.0.0',
    description: 'Plateforme de paiement résiliente - Project RESILIENCE-ALPHA',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Sonde de santé du service
 *     description: >
 *       Vérifie l'état opérationnel de l'API et la connectivité avec la base de données PostgreSQL.
 *       Utilisée comme sonde **liveness** et **readiness** par Kubernetes.
 *     tags:
 *       - Système
 *     responses:
 *       200:
 *         description: Service et base de données opérationnels
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 *       503:
 *         description: Service dégradé — base de données inaccessible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: 'up',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: 'down',
        error: error instanceof Error ? error.message : 'Unknown database error',
      },
    });
  }
});

// Middleware 404 pour les routes inconnues
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Middleware de gestion d'erreurs globales
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    timestamp: new Date().toISOString(),
  });
});
