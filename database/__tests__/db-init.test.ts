import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitForDatabase, seedDatabase, pushSchema, commandRunner } from '../init';

describe('Database Init & Migration Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('waitForDatabase (Sonde de résilience & Retry)', () => {
    it('doit réussir immédiatement si la base de données répond au premier essai', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]),
      } as any;

      const ready = await waitForDatabase(mockPrisma, 3, 10);

      expect(ready).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('doit réitérer et réussir si PostgreSQL devient accessible après plusieurs tentatives', async () => {
      const mockPrisma = {
        $queryRaw: vi
          .fn()
          .mockRejectedValueOnce(new Error('Connection refused'))
          .mockRejectedValueOnce(new Error('PostgreSQL starting up'))
          .mockResolvedValueOnce([{ '?column?': 1 }]),
      } as any;

      const ready = await waitForDatabase(mockPrisma, 4, 10);

      expect(ready).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('doit renvoyer false si PostgreSQL reste inaccessible au-delà du nombre maximal de tentatives', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockRejectedValue(new Error('Host unreachable')),
      } as any;

      const ready = await waitForDatabase(mockPrisma, 3, 5);

      expect(ready).toBe(false);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
    });
  });

  describe('pushSchema & seedDatabase (Orchestration)', () => {
    it('doit appeler prisma db push avec les bons arguments pour déployer le schéma', async () => {
      const spyRun = vi.spyOn(commandRunner, 'run').mockResolvedValueOnce({
        success: true,
        output: 'Your database is now in sync with your Prisma schema.',
      });

      const result = await pushSchema('prisma/schema.prisma');

      expect(result.success).toBe(true);
      expect(spyRun).toHaveBeenCalledWith('npx', [
        'prisma',
        'db',
        'push',
        '--schema=prisma/schema.prisma',
        '--accept-data-loss',
        '--skip-generate',
      ]);
    });

    it('doit cibler le script seed-10k lorsque seedType vaut "10k"', async () => {
      const spyRun = vi.spyOn(commandRunner, 'run').mockResolvedValueOnce({
        success: true,
        output: 'Seed completed successfully.',
      });

      const result = await seedDatabase('10k');

      expect(result.success).toBe(true);
      expect(spyRun).toHaveBeenCalled();
      const [cmd, args] = spyRun.mock.calls[0];
      expect(['node', 'npx']).toContain(cmd);
      expect(args.some((arg: string) => arg.includes('seed-10k'))).toBe(true);
    });

    it('doit cibler le script seed standard lorsque seedType vaut "standard"', async () => {
      const spyRun = vi.spyOn(commandRunner, 'run').mockResolvedValueOnce({
        success: true,
        output: 'Standard seed completed.',
      });

      const result = await seedDatabase('standard');

      expect(result.success).toBe(true);
      expect(spyRun).toHaveBeenCalled();
      const [cmd, args] = spyRun.mock.calls[0];
      expect(['node', 'npx']).toContain(cmd);
      expect(args.some((arg: string) => arg.includes('seed.'))).toBe(true);
    });

    it('doit cibler le script seed standard par défaut lorsque aucun paramètre n\'est fourni', async () => {
      const spyRun = vi.spyOn(commandRunner, 'run').mockResolvedValueOnce({
        success: true,
        output: 'Standard seed completed by default.',
      });

      const result = await seedDatabase();

      expect(result.success).toBe(true);
      expect(spyRun).toHaveBeenCalled();
      const [cmd, args] = spyRun.mock.calls[0];
      expect(['node', 'npx']).toContain(cmd);
      expect(args.some((arg: string) => arg.includes('seed.'))).toBe(true);
    });
  });
});
