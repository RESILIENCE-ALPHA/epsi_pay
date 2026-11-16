// Applique les migrations Prisma versionnées (prisma/migrations) : ne supprime jamais de données.
// Lancé avant chaque déploiement (Argo CD, hook PreSync) et par le seeder avant d'insérer les données.
//
// Base existante créée par l'ancien `prisma db push` (tables présentes, pas de table _prisma_migrations) :
// la migration initiale est marquée comme déjà appliquée (baseline), puis seules les suivantes s'exécutent.
// Base vide : toutes les migrations s'appliquent, la première crée le schéma complet.
import { spawnSync } from 'child_process';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { databaseUrl } from './database-url';

const BASELINE = '0_init';
// Lancé depuis le dossier database/ (npm run …) ou /app dans l'image
const SCHEMA = join(process.cwd(), 'prisma', 'schema.prisma');
const PRISMA_BIN = join(process.cwd(), 'node_modules', '.bin', 'prisma');
const env = { ...process.env, DATABASE_URL: databaseUrl() };

function prisma(args: string[]): number {
  const { status } = spawnSync(PRISMA_BIN, args, { stdio: 'inherit', env });
  return status ?? 1;
}

/** Tables déjà là mais aucune migration enregistrée : base créée par db push avant les migrations */
async function needsBaseline(): Promise<boolean> {
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const [row] = await db.$queryRaw<{ migrations: string | null; users: string | null }[]>`
      SELECT to_regclass('public._prisma_migrations')::text AS migrations,
             to_regclass('public.users')::text AS users`;
    return row.migrations === null && row.users !== null;
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  if (await needsBaseline()) {
    console.log(`Base créée par db push : migration ${BASELINE} marquée comme déjà appliquée (baseline).`);
    if (prisma(['migrate', 'resolve', '--applied', BASELINE, `--schema=${SCHEMA}`]) !== 0) process.exit(1);
  }

  console.log('Application des migrations en attente…');
  if (prisma(['migrate', 'deploy', `--schema=${SCHEMA}`]) !== 0) process.exit(1);

  // Contrôle : la base correspond-elle exactement au schéma ? Un écart signale une modification faite
  // à la main ou un changement de schema.prisma sans migration. Signalé, sans bloquer le déploiement.
  console.log('Vérification : base de données = schema.prisma ?');
  const drift = prisma(['migrate', 'diff', '--from-url', env.DATABASE_URL, '--to-schema-datamodel', SCHEMA, '--exit-code']);
  if (drift === 0) console.log('OK : aucun écart.');
  else if (drift === 2) console.warn('ATTENTION : écart entre la base et schema.prisma (SQL ci-dessus). Créez une migration (npm run migrate:dev).');
  else console.warn('ATTENTION : vérification impossible (prisma migrate diff a échoué).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
