#!/bin/bash
set -e

echo ""
echo "=== Livelo Redeem Flow — Setup ==="
echo ""

# ── Coleta de variáveis ───────────────────────────────────────────────────────

collect_env() {
  echo "Supabase → https://supabase.com/dashboard → Settings → API"
  read -rp  "  Project ID:          " SUPABASE_PROJECT_ID
  read -rp  "  Anon/public key:     " SUPABASE_PUBLISHABLE_KEY
  SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"

  echo ""
  echo "Cloudflare Turnstile (deixe em branco para desabilitar)"
  read -rp  "  Site Key (frontend):  " TURNSTILE_SITE_KEY
  read -rp  "  Secret Key (backend): " TURNSTILE_SECRET_KEY

  echo ""
  echo "Risenew — sender padrão (OTP) → https://risenew.lat"
  read -rp  "  API URL:    " RISENEW_API_URL
  read -rp  "  API Key:    " RISENEW_API_KEY
  read -rp  "  API Secret: " RISENEW_API_SECRET
  read -rp  "  Sender:     " RISENEW_SENDER

  echo ""
  echo "Risenew — sender alternativo (SMS manual, opcional)"
  read -rp  "  API Key:    " RISENEW_API_KEY_2
  read -rp  "  API Secret: " RISENEW_API_SECRET_2
  read -rp  "  Sender:     " RISENEW_SENDER_2

  echo ""
  echo "IPInfo → https://ipinfo.io/account/token"
  read -rp  "  Token: " IPINFO_TOKEN

  echo ""
  echo "ZenRows → https://app.zenrows.com"
  read -rp  "  API Key: " ZENROWS_API_KEY

  echo ""
  echo "Meta Pixel (opcional)"
  read -rp  "  Pixel ID (frontend):    " META_PIXEL_ID_VITE
  read -rp  "  Pixel ID (edge fn):     " META_PIXEL_ID
  read -rp  "  CAPI Access Token:      " META_CAPI_ACCESS_TOKEN

  echo ""
  echo "SMS — labels e link (opcionais)"
  read -rp  "  Label sender padrão (ex: Bradesco):     " SMS_SENDER_1_LABEL
  read -rp  "  Label sender alternativo (ex: Livelo):  " SMS_SENDER_2_LABEL
  read -rp  "  Link para placeholder {{link}}:          " SMS_LINK

  cat > .env <<EOF
# Gerado por setup.sh em $(date '+%Y-%m-%d %H:%M:%S')

VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY}
VITE_META_PIXEL_ID=${META_PIXEL_ID_VITE}
VITE_SMS_SENDER_1_LABEL=${SMS_SENDER_1_LABEL}
VITE_SMS_SENDER_2_LABEL=${SMS_SENDER_2_LABEL}
VITE_SMS_LINK=${SMS_LINK}

RISENEW_API_URL=${RISENEW_API_URL}
RISENEW_API_KEY=${RISENEW_API_KEY}
RISENEW_API_SECRET=${RISENEW_API_SECRET}
RISENEW_SENDER=${RISENEW_SENDER}
RISENEW_API_KEY_2=${RISENEW_API_KEY_2}
RISENEW_API_SECRET_2=${RISENEW_API_SECRET_2}
RISENEW_SENDER_2=${RISENEW_SENDER_2}
TURNSTILE_SECRET_KEY=${TURNSTILE_SECRET_KEY}
IPINFO_TOKEN=${IPINFO_TOKEN}
ZENROWS_API_KEY=${ZENROWS_API_KEY}
META_PIXEL_ID=${META_PIXEL_ID}
META_CAPI_ACCESS_TOKEN=${META_CAPI_ACCESS_TOKEN}
EOF

  echo ""
  echo "✓ .env criado"
  echo ""
}

if [ -f .env ]; then
  read -rp ".env já existe. Reconfigurar? (s/N): " RECONFIG
  [[ "$RECONFIG" =~ ^[Ss]$ ]] && collect_env
else
  collect_env
fi

# ── Lê project ID ─────────────────────────────────────────────────────────────

PROJECT_ID=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | cut -d '=' -f2 | tr -d '[:space:]"')
[ -z "$PROJECT_ID" ] && echo "ERRO: VITE_SUPABASE_PROJECT_ID não encontrado" && exit 1

SUPABASE="npx supabase"

# ── 1. Link ───────────────────────────────────────────────────────────────────

echo "[ 1/6 ] Conectando ao projeto Supabase..."
$SUPABASE link --project-ref "$PROJECT_ID"
echo ""

# ── 2. Secrets ────────────────────────────────────────────────────────────────

echo "[ 2/6 ] Configurando secrets..."

set_secret() {
  local key=$1
  local val
  val=$(grep -E "^${key}=" .env | cut -d '=' -f2 | tr -d '[:space:]"')
  [ -n "$val" ] && $SUPABASE secrets set "${key}=${val}" --project-ref "$PROJECT_ID"
}

set_secret RISENEW_API_URL
set_secret RISENEW_API_KEY
set_secret RISENEW_API_SECRET
set_secret RISENEW_SENDER
set_secret RISENEW_API_KEY_2
set_secret RISENEW_API_SECRET_2
set_secret RISENEW_SENDER_2
set_secret TURNSTILE_SECRET_KEY
set_secret IPINFO_TOKEN
set_secret ZENROWS_API_KEY
set_secret META_PIXEL_ID
set_secret META_CAPI_ACCESS_TOKEN
echo ""

# ── 3. Migrations ─────────────────────────────────────────────────────────────

echo "[ 3/6 ] Aplicando migrations..."
$SUPABASE db push
echo ""

# ── 4. Edge functions ─────────────────────────────────────────────────────────

echo "[ 4/6 ] Deploy das edge functions..."
$SUPABASE functions deploy --project-ref "$PROJECT_ID"
echo ""

# ── 5. Build ──────────────────────────────────────────────────────────────────

echo "[ 5/6 ] Buildando o frontend..."
if command -v bun &> /dev/null; then
  bun install && bun run build
else
  npm install && npm run build
fi
echo ""

# ── 6. Autenticação /admin via Basic Auth ─────────────────────────────────────

echo "[ 6/6 ] Configurando autenticação do painel /admin..."
echo ""
echo "  Caminho absoluto onde dist/ será servido pelo Apache"
echo "  Exemplo: /var/www/inss/mitt/dist"
read -rp  "  Caminho de deploy: " DEPLOY_PATH
read -rp  "  Usuário admin:     " HTPASSWD_USER
read -rsp "  Senha admin:       " HTPASSWD_PASS
echo ""

# Gera hash compatível com Apache (APR1-MD5, disponível via openssl)
if command -v htpasswd &> /dev/null; then
  HTPASSWD_HASH=$(htpasswd -bnBC 10 "" "$HTPASSWD_PASS" | tr -d ':\n' | sed 's/^/\$2y\$10\$/')
  # fallback — usa openssl se htpasswd retornar formato inesperado
  HTPASSWD_HASH=$(htpasswd -nbm "$HTPASSWD_USER" "$HTPASSWD_PASS" | cut -d: -f2)
  echo "${HTPASSWD_USER}:${HTPASSWD_HASH}" > dist/.htpasswd
else
  HTPASSWD_HASH=$(openssl passwd -apr1 "$HTPASSWD_PASS")
  echo "${HTPASSWD_USER}:${HTPASSWD_HASH}" > dist/.htpasswd
fi

# Appenda bloco de auth ao .htaccess gerado pelo build
cat >> dist/.htaccess <<EOF

# ── Proteção do painel admin ──────────────────────────────────────────────────

<Files ".htpasswd">
  Require all denied
</Files>

<If "%{REQUEST_URI} =~ m#^/admin#">
  AuthType Basic
  AuthName "Painel Admin"
  AuthUserFile ${DEPLOY_PATH}/.htpasswd
  Require valid-user
</If>
EOF

echo ""
echo "✓ dist/.htpasswd criado"
echo "✓ dist/.htaccess atualizado com AuthUserFile ${DEPLOY_PATH}/.htpasswd"
echo ""
echo "=== Pronto! Sirva a pasta dist/ em ${DEPLOY_PATH} com seu Apache. ==="
echo ""
