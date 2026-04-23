#!/bin/sh

echo "=============================================="
echo "Iniciando processo de inicialização (start.sh)"
echo "=============================================="

echo "1. Sincronizando o banco de dados com o Prisma..."
npx prisma db push --accept-data-loss

echo "2. Iniciando a aplicação Express..."
exec node dist/index.js
