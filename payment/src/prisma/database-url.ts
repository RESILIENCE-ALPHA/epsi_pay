// URL PostgreSQL construite à partir des mêmes clés dans auth, payment et database (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
export function databaseUrl(): string {
  const { DB_HOST, DB_PORT = '5432', DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const missing = Object.entries({ DB_HOST, DB_NAME, DB_USER, DB_PASSWORD })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Variables de base de données manquantes : ${missing.join(', ')}`);
  }
  const user = encodeURIComponent(DB_USER!);
  const password = encodeURIComponent(DB_PASSWORD!);
  return `postgresql://${user}:${password}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME!)}?schema=public`;
}
