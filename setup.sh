#!/bin/bash
set -e

echo ""
echo "=== Livelo Redeem Flow — Setup ==="
echo ""

# 1. Verifica se .env existe
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ .env criado a partir do .env.example"
  echo ""
  echo "  Preencha as variáveis no arquivo .env e rode ./setup.sh novamente."
  echo ""
  exit 1
fi

# 2. Lê o project ID do .env
PROJECT_ID=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | cut -d '=' -f2 | tr -d '[:space:]"')

if [ -z "$PROJECT_ID" ]; then
  echo "ERRO: VITE_SUPABASE_PROJECT_ID não encontrado no .env"
  exit 1
fi

echo "  Projeto Supabase: $PROJECT_ID"
echo ""

# 3. Verifica se supabase CLI está disponível
if ! command -v supabase &> /dev/null && ! npx supabase --version &> /dev/null 2>&1; then
  echo "ERRO: Supabase CLI não encontrado. Instale com: npm install -g supabase"
  exit 1
fi

SUPABASE="npx supabase"

# 4. Link com o projeto
echo "[ 1/4 ] Conectando ao projeto Supabase..."
$SUPABASE link --project-ref "$PROJECT_ID"
echo ""

# 5. Aplica as migrations
echo "[ 2/4 ] Aplicando migrations no banco de dados..."
$SUPABASE db push
echo ""

# 6. Deploy das edge functions
echo "[ 3/4 ] Fazendo deploy das edge functions..."
$SUPABASE functions deploy --project-ref "$PROJECT_ID"
echo ""

# 7. Build do frontend
echo "[ 4/4 ] Buildando o frontend..."
if command -v bun &> /dev/null; then
  bun run build
else
  npm run build
fi
echo ""

echo "=== Setup concluído! ==="
echo ""
echo "  Sirva a pasta dist/ com seu servidor web (nginx, caddy, etc.)"
echo ""
