#!/bin/sh
set -e

echo "[ENTRYPOINT] Démarrage du conteneur d'initialisation de la base de données EPSI Pay..."

if [ -f "dist/database/init.js" ]; then
  exec node dist/database/init.js "$@"
else
  exec npx tsx database/init.ts "$@"
fi
