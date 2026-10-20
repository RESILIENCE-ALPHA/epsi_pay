import express, { Express, Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';

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

// Route racine d'informations
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'epsi-pay-api',
    status: 'operational',
    version: '1.0.0',
    description: 'Plateforme de paiement résiliente - Project RESILIENCE-ALPHA',
    timestamp: new Date().toISOString(),
  });
});

// Sonde de santé et connectivité (Readiness & Liveness probe)
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
