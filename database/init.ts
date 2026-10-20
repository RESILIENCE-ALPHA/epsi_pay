import fs from 'fs';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

export interface InitOptions {
  databaseUrl?: string;
  schemaPath?: string;
  seedType?: 'standard' | '10k';
  maxRetries?: number;
  retryIntervalMs?: number;
}

export interface StepResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Exécute une commande système et capture sa sortie
 */
export function runCommand(command: string, args: string[]): Promise<StepResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({
          success: false,
          output: stdout,
          error: stderr || `Command exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: stdout,
        error: err.message,
      });
    });
  });
}

export const commandRunner = {
  run: runCommand,
};

/**
 * Sonde de connectivité avec boucle de réessai (résilience K8s)
 */
export async function waitForDatabase(
  client: PrismaClient,
  maxRetries = 10,
  retryIntervalMs = 3000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.$queryRaw`SELECT 1`;
      console.log(`[DB-INIT] ✅ Connectivité PostgreSQL validée à la tentative ${attempt}/${maxRetries}.`);
      return true;
    } catch (err) {
      console.warn(
        `[DB-INIT] ⏳ Attente de PostgreSQL (${attempt}/${maxRetries}) : ${(err as Error).message}. Nouvelle tentative dans ${retryIntervalMs / 1000}s...`
      );
      if (attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, retryIntervalMs));
      }
    }
  }
  return false;
}

/**
 * Applique le schéma Prisma sur la base
 */
export async function pushSchema(schemaPath = 'database/prisma/schema.prisma'): Promise<StepResult> {
  console.log(`[DB-INIT] 🚀 Déploiement du schéma Prisma (${schemaPath})...`);
  return commandRunner.run('npx', [
    'prisma',
    'db',
    'push',
    `--schema=${schemaPath}`,
    '--accept-data-loss',
    '--skip-generate',
  ]);
}

/**
 * Lance le peuplement de la base (standard ou 10k)
 */
export async function seedDatabase(seedType: 'standard' | '10k' = '10k'): Promise<StepResult> {
  const tsPath = seedType === '10k' ? 'database/prisma/seed-10k.ts' : 'database/prisma/seed.ts';
  const jsPath = seedType === '10k' ? 'dist/database/prisma/seed-10k.js' : 'dist/database/prisma/seed.js';

  if (fs.existsSync(jsPath)) {
    console.log(`[DB-INIT] 🌱 Peuplement de la base (${seedType} via ${jsPath})...`);
    return commandRunner.run('node', [jsPath]);
  } else {
    console.log(`[DB-INIT] 🌱 Peuplement de la base (${seedType} via ${tsPath})...`);
    return commandRunner.run('npx', ['tsx', tsPath]);
  }
}

/**
 * Point d'entrée principal pour le K8s Job
 */
export async function runInitialization(options: InitOptions = {}): Promise<void> {
  console.log('====================================================');
  console.log('   🚀 EPSI PAY - JOB D\'INITIALISATION BASE DE DONNÉES');
  console.log('====================================================');

  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[DB-INIT] ❌ Variable d\'environnement DATABASE_URL manquante.');
    process.exit(1);
  }

  const schemaPath = options.schemaPath || process.env.SCHEMA_PATH || 'database/prisma/schema.prisma';
  const seedType: 'standard' | '10k' =
    options.seedType || (process.env.SEED_TYPE === 'standard' ? 'standard' : '10k');
  const maxRetries = options.maxRetries ?? (process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES, 10) : 12);
  const retryIntervalMs = options.retryIntervalMs ?? 3000;

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    // 1. Attente de la base de données
    const isReady = await waitForDatabase(prisma, maxRetries, retryIntervalMs);
    if (!isReady) {
      throw new Error(`PostgreSQL n'a pas répondu après ${maxRetries} tentatives.`);
    }

    // 2. Déploiement du schéma
    const pushResult = await pushSchema(schemaPath);
    if (!pushResult.success) {
      throw new Error(`Échec du déploiement du schéma : ${pushResult.error}`);
    }

    // 3. Peuplement (Seed)
    if (process.env.SKIP_SEED !== 'true') {
      const seedResult = await seedDatabase(seedType);
      if (!seedResult.success) {
        throw new Error(`Échec du peuplement des données : ${seedResult.error}`);
      }
    } else {
      console.log('[DB-INIT] ⏭️ Étape de seed ignorée (SKIP_SEED=true).');
    }

    console.log('====================================================');
    console.log('   ✅ INITIALISATION BDD TERMINÉE AVEC SUCCÈS');
    console.log('====================================================');
  } catch (error) {
    console.error('[DB-INIT] 💥 Erreur fatale lors de l\'initialisation :', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution directe en CLI
if (require.main === module) {
  runInitialization();
}
