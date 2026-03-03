#!/bin/bash
set -e

echo ""
echo "=== Livelo Redeem Flow — Setup ==="
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 1. Coleta de variáveis
# ──────────────────────────────────────────────────────────────────────────────

collect_env() {
  echo "Vamos configurar o ambiente. Encontre os valores em:"
  echo "  → https://supabase.com/dashboard → Settings → API"
  echo ""

  # Supabase
  read -rp "  Project ID (ex: abcdefghijklmnopqrst): " SUPABASE_PROJECT_ID
  read -rp "  Anon/public key (JWT):                 " SUPABASE_PUBLISHABLE_KEY

  # URL derivada do project ID
  SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"

  echo ""
  echo "  → Painel /admin"
  read -rsp "  Senha do painel admin:                 " ADMIN_PASSWORD
  echo ""

  echo ""
  echo "  → Cloudflare Turnstile (deixe em branco para desabilitar CAPTCHA)"
  read -rp "  Turnstile Site Key (frontend):         " TURNSTILE_SITE_KEY
  read -rp "  Turnstile Secret Key (backend):        " TURNSTILE_SECRET_KEY

  echo ""
  echo "  → Risenew (SMS / OTP) — https://risenew.lat"
  read -rp "  Risenew API Key:                       " RISENEW_API_KEY
  read -rp "  Risenew API Secret:                    " RISENEW_API_SECRET

  echo ""
  echo "  → IPInfo (geolocalização) — https://ipinfo.io/account/token"
  read -rp "  IPInfo Token:                          " IPINFO_TOKEN

  echo ""
  echo "  → ZenRows (scraping segmento) — https://app.zenrows.com"
  read -rp "  ZenRows API Key:                       " ZENROWS_API_KEY

  # Escreve o .env
  cat > .env <<EOF
# Gerado por setup.sh em $(date '+%Y-%m-%d %H:%M:%S')

# ── Supabase ──────────────────────────────────────────────────────────────────
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_URL=${SUPABASE_URL}

# ── Admin Panel ───────────────────────────────────────────────────────────────
VITE_ADMIN_PASSWORD=${ADMIN_PASSWORD}

# ── Cloudflare Turnstile ──────────────────────────────────────────────────────
VITE_TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY}

# ── Edge Function Secrets ─────────────────────────────────────────────────────
RISENEW_API_KEY=${RISENEW_API_KEY}
RISENEW_API_SECRET=${RISENEW_API_SECRET}
TURNSTILE_SECRET_KEY=${TURNSTILE_SECRET_KEY}
IPINFO_TOKEN=${IPINFO_TOKEN}
ZENROWS_API_KEY=${ZENROWS_API_KEY}
EOF

  echo ""
  echo "✓ .env criado"
  echo ""
}

if [ -f .env ]; then
  read -rp ".env já existe. Reconfigurar? (s/N): " RECONFIG
  if [[ "$RECONFIG" =~ ^[Ss]$ ]]; then
    collect_env
  fi
else
  collect_env
fi

# ──────────────────────────────────────────────────────────────────────────────
# 2. Lê o project ID do .env
# ──────────────────────────────────────────────────────────────────────────────

PROJECT_ID=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | cut -d '=' -f2 | tr -d '[:space:]"')

if [ -z "$PROJECT_ID" ]; then
  echo "ERRO: VITE_SUPABASE_PROJECT_ID não encontrado no .env"
  exit 1
fi

echo "  Projeto Supabase: $PROJECT_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 3. Verifica Supabase CLI
# ──────────────────────────────────────────────────────────────────────────────

if ! command -v supabase &> /dev/null && ! npx supabase --version &> /dev/null 2>&1; then
  echo "ERRO: Supabase CLI não encontrado. Instale com: npm install -g supabase"
  exit 1
fi

SUPABASE="npx supabase"

# ──────────────────────────────────────────────────────────────────────────────
# 4. Link com o projeto
# ──────────────────────────────────────────────────────────────────────────────

echo "[ 1/5 ] Conectando ao projeto Supabase..."
$SUPABASE link --project-ref "$PROJECT_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 5. Configura secrets das edge functions
# ──────────────────────────────────────────────────────────────────────────────

echo "[ 2/5 ] Configurando secrets das edge functions..."

set_secret() {
  local key=$1
  local val
  val=$(grep -E "^${key}=" .env | cut -d '=' -f2 | tr -d '[:space:]"')
  if [ -n "$val" ]; then
    $SUPABASE secrets set "${key}=${val}" --project-ref "$PROJECT_ID"
  fi
}

set_secret RISENEW_API_KEY
set_secret RISENEW_API_SECRET
set_secret TURNSTILE_SECRET_KEY
set_secret IPINFO_TOKEN
set_secret ZENROWS_API_KEY

echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 6. Aplica as migrations
# ──────────────────────────────────────────────────────────────────────────────

echo "[ 3/5 ] Aplicando migrations no banco de dados..."
$SUPABASE db push
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 7. Deploy das edge functions
# ──────────────────────────────────────────────────────────────────────────────

echo "[ 4/5 ] Fazendo deploy das edge functions..."
$SUPABASE functions deploy --project-ref "$PROJECT_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# 8. Build do frontend
# ──────────────────────────────────────────────────────────────────────────────

echo "[ 5/5 ] Buildando o frontend..."
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
