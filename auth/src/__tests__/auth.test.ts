import http from 'http';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { authApp } from '../server';
import { prisma, UserRole, UserStatus } from '@epsi-pay/database';

describe('Service Auth — Endpoints & Résilience Red Team', () => {
  let server: http.Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer(authApp);
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

  const testPassword = 'PasswordValid123!';
  const hashedPassword = bcrypt.hashSync(testPassword, 10);

  const mockUser = {
    id: 'user-uuid-1234',
    email: 'alice@epsi.fr',
    passwordHash: hashedPassword,
    name: 'Alice Martin',
    role: UserRole.CLIENT,
    status: UserStatus.ACTIVE,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  describe('POST /auth/login', () => {
    it('doit réussir avec des identifiants valides et générer un jeton de session', async () => {
      vi.spyOn(prisma.blockedIp, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({ ...mockUser });
      vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({ ...mockUser });
      vi.spyOn(prisma.session, 'create').mockResolvedValueOnce({
        id: 'session-1',
        userId: mockUser.id,
        tokenHash: 'hash-abc',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isValid: true,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      const loginAttemptSpy = vi.spyOn(prisma.loginAttempt, 'create').mockResolvedValueOnce({} as any);

      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'alice@epsi.fr', password: testPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toMatchObject({
        id: mockUser.id,
        email: 'alice@epsi.fr',
        name: 'Alice Martin',
        role: 'CLIENT',
        status: 'ACTIVE',
      });
      // Vérification enregistrement ML
      expect(loginAttemptSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          attemptedEmail: 'alice@epsi.fr',
          targetUserId: mockUser.id,
          isAuthenticated: true,
          failureReason: null,
        }),
      });
    });

    it('doit rejeter avec 401 si le mot de passe est erroné et décrémenter les tentatives', async () => {
      vi.spyOn(prisma.blockedIp, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        ...mockUser,
        failedLoginAttempts: 2,
      });
      const userUpdateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
      const loginAttemptSpy = vi.spyOn(prisma.loginAttempt, 'create').mockResolvedValueOnce({} as any);

      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'alice@epsi.fr', password: 'MauvaisMotDePasse!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('INVALID_CREDENTIALS');
      expect(response.body.remainingAttempts).toBe(2); // 5 - (2 + 1) = 2

      // Vérification incrémentation du compteur
      expect(userUpdateSpy).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          failedLoginAttempts: 3,
        }),
      });

      // Vérification log ML
      expect(loginAttemptSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          attemptedEmail: 'alice@epsi.fr',
          isAuthenticated: false,
          failureReason: 'INVALID_CREDENTIALS',
        }),
      });
    });

    it('doit verrouiller le compte (423 Locked) après 5 échecs consécutifs (Brute Force)', async () => {
      vi.spyOn(prisma.blockedIp, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        ...mockUser,
        failedLoginAttempts: 4, // 5ème échec imminent
      });
      const userUpdateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValueOnce({} as any);
      const auditLogSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValueOnce({} as any);
      const loginAttemptSpy = vi.spyOn(prisma.loginAttempt, 'create').mockResolvedValueOnce({} as any);

      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'alice@epsi.fr', password: 'MauvaisMotDePasse5!' });

      expect(response.status).toBe(423);
      expect(response.body.error).toBe('ACCOUNT_LOCKED');
      expect(response.body.lockedUntil).toBeDefined();

      // Vérification bascule en status LOCKED
      expect(userUpdateSpy).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          status: UserStatus.LOCKED,
          lockedUntil: expect.any(Date),
        }),
      });

      // Audit de sécurité pour SIEM / Wazuh
      expect(auditLogSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'BRUTE_FORCE_ACCOUNT_LOCKED',
          severity: 'CRITICAL',
        }),
      });

      // ML trace
      expect(loginAttemptSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          failureReason: 'BRUTE_FORCE_LOCKED',
        }),
      });
    });

    it('doit bloquer immédiatement avec 403 Forbidden si l\'adresse IP est sur liste noire', async () => {
      vi.spyOn(prisma.blockedIp, 'findFirst').mockResolvedValueOnce({
        id: 'block-1',
        ipAddress: '192.168.1.50',
        reason: 'ML_ANOMALY_BRUTE_FORCE',
        blockedBy: 'AUTO_REMEDIATION',
        isActive: true,
        blockedAt: new Date(),
        expiresAt: null,
      });
      const userFindSpy = vi.spyOn(prisma.user, 'findUnique');
      const loginAttemptSpy = vi.spyOn(prisma.loginAttempt, 'create').mockResolvedValueOnce({} as any);

      const response = await request(server)
        .post('/auth/login')
        .set('X-Forwarded-For', '192.168.1.50')
        .send({ email: 'alice@epsi.fr', password: testPassword });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('IP_BLOCKED');
      expect(userFindSpy).not.toHaveBeenCalled(); // Ne sollicite même pas la table users (résilience)
      expect(loginAttemptSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '192.168.1.50',
          failureReason: 'IP_BLOCKED',
        }),
      });
    });
  });

  describe('GET /auth/me', () => {
    it('doit renvoyer le profil utilisateur avec un Bearer token valide', async () => {
      vi.spyOn(prisma.session, 'findUnique').mockResolvedValueOnce({
        id: 'session-1',
        userId: mockUser.id,
        tokenHash: 'some-hash',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isValid: true,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        user: mockUser,
      } as any);

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', 'Bearer token_secret_123');

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: mockUser.id,
        email: 'alice@epsi.fr',
        name: 'Alice Martin',
      });
      expect(response.body.user.passwordHash).toBeUndefined(); // Jamais de mot de passe exposé
    });

    it('doit refuser l\'accès avec 401 si aucun token n\'est fourni', async () => {
      const response = await request(server).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    it('doit révoquer la session active avec un statut 200', async () => {
      vi.spyOn(prisma.session, 'findUnique').mockResolvedValueOnce({
        id: 'session-1',
        userId: mockUser.id,
        tokenHash: 'some-hash',
        isValid: true,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        user: mockUser,
      } as any);
      const updateManySpy = vi.spyOn(prisma.session, 'updateMany').mockResolvedValueOnce({ count: 1 });

      const response = await request(server)
        .post('/auth/logout')
        .set('Authorization', 'Bearer token_to_revoke');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Déconnexion réussie');
      expect(updateManySpy).toHaveBeenCalledWith({
        where: expect.objectContaining({ isValid: true }),
        data: { isValid: false },
      });
    });
  });
});
