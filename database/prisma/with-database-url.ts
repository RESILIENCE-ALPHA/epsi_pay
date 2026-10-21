// Lance une commande (CLI prisma) avec DATABASE_URL, lu par schema.prisma, construit depuis les clés DB_*
import { spawnSync } from 'child_process';
import { databaseUrl } from './database-url';

const [command, ...args] = process.argv.slice(2);
const { status } = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: databaseUrl() },
});
process.exit(status ?? 1);
