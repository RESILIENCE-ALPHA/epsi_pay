import http from 'http';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '@epsi-pay/database';

describe('API Service - Endpoints & Résilience', () => {
  let server: http.Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      // Écoute sur le loopback IPv6 pour une isolation réseau optimale
      server.listen(0, '::1', () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /docs (Swagger UI)', () => {
    it('doit retourner la page Swagger UI avec un statut 200', async () => {
      const response = await request(server).get('/docs/');
      expect(response.status).toBe(200);
      expect(response.text).toContain('swagger');
    });

    it('doit exposer la spécification OpenAPI en JSON sur /docs.json', async () => {
      const response = await request(server).get('/docs.json');
      expect(response.status).toBe(200);
      expect(response.body.openapi).toBe('3.0.0');
      expect(response.body.info.title).toBe('EPSI Pay API');
      expect(response.body.paths).toBeDefined();
    });
  });

  describe('GET / (Informations générales)', () => {
    it('doit renvoyer un statut 200 avec les métadonnées du service', async () => {
      const response = await request(server).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: 'epsi-pay-api',
        status: 'operational',
        version: '1.0.0',
        description: 'Plateforme de paiement résiliente - Project RESILIENCE-ALPHA',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('doit renvoyer les en-têtes CORS appropriés', async () => {
      const response = await request(server).options('/');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('GET /health (Sonde de santé & Résilience DB)', () => {
    it('doit renvoyer un statut 200 et status "healthy" lorsque la base de données est accessible', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }] as any);

      const response = await request(server).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        checks: {
          database: 'up',
        },
      });
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.timestamp).toBeDefined();
    });

    it('doit renvoyer un statut 503 et status "degraded" lorsque la base de données est indisponible', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused to postgres:5432'));

      const response = await request(server).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'degraded',
        checks: {
          database: 'down',
          error: 'Connection refused to postgres:5432',
        },
      });
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Gestion des routes inconnues (404)', () => {
    it('doit renvoyer un code 404 au format JSON pour une URL inexistante', async () => {
      const response = await request(server).get('/route-inexistante-xyz');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Not Found',
      });
      expect(response.body.message).toContain('/route-inexistante-xyz');
    });
  });
});
