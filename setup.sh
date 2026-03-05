#!/bin/bash

# --- Cores e Estilo ---
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}info${NC}    $1"; }
log_success() { echo -e "${GREEN}success${NC} $1"; }
log_error()   { echo -e "${RED}error${NC}   $1"; }
log_step()    { echo -e "\n${BOLD}${CYAN}--- $1 ---${NC}"; }

check_dep() {
  if ! command -v "$1" &>/dev/null; then
    log_error "Dependência '$1' não encontrada. Instale antes de continuar."
    exit 1
  fi
}

clear
echo -e "${BOLD}${BLUE}"
echo "  ================================================"
echo "     LIVELO REDEEM FLOW — PROFESSIONAL SETUP      "
echo "  ================================================"
echo -e "${NC}"

check_dep "npx"
check_dep "openssl"
check_dep "node"

ENV_FILE=".env"

# --- Função para capturar valores com fallback ---
ask() {
  local label=$1 var_name=$2 default_val=$3 is_secret=$4 input
  if [ "$is_secret" = "true" ]; then
    echo -ne "${BOLD}${label}${NC} ${YELLOW}(oculto)${NC}: "
    read -rs input; echo ""
  else
    echo -ne "${BOLD}${label}${NC} ${CYAN}[${default_val}]${NC}: "
    read -r input
  fi
  eval "$var_name=\"${input:-$default_val}\""
}

# ── 0. Login Supabase ─────────────────────────────────────────────────────────

log_step "0. AUTENTICAÇÃO SUPABASE"

if ! npx supabase projects list &>/dev/null 2>&1; then
  log_info "Faça login na sua conta Supabase:"
  npx supabase login
fi

# ── 1. Selecionar projeto ─────────────────────────────────────────────────────

log_step "1. PROJETO SUPABASE"
log_info "Buscando projetos disponíveis..."

PROJECTS_JSON=$(npx supabase projects list -o json 2>/dev/null)

PROJECT_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$PROJECTS_JSON")

if [ "$PROJECT_COUNT" -eq 0 ]; then
  log_error "Nenhum projeto encontrado. Crie um em https://supabase.com"
  exit 1
fi

echo ""
node -e "
const p = JSON.parse(process.argv[1]);
p.forEach((x, i) => {
  console.log('  \033[1m' + (i+1) + '.\033[0m ' + x.name + ' \033[36m(' + x.id + ')\033[0m');
});
" "$PROJECTS_JSON"
echo ""

read -rp "$(echo -e "${BOLD}Selecione o projeto [1-${PROJECT_COUNT}]:${NC} ")" PROJECT_NUM
PROJECT_IDX=$((PROJECT_NUM - 1))

if [ "$PROJECT_IDX" -lt 0 ] || [ "$PROJECT_IDX" -ge "$PROJECT_COUNT" ]; then
  log_error "Seleção inválida"
  exit 1
fi

SUPABASE_PROJECT_ID=$(node -e "const p=JSON.parse(process.argv[1]);console.log(p[$PROJECT_IDX].id)" "$PROJECTS_JSON")
PROJECT_NAME=$(node -e "const p=JSON.parse(process.argv[1]);console.log(p[$PROJECT_IDX].name)" "$PROJECTS_JSON")

log_success "Projeto: ${PROJECT_NAME} (${SUPABASE_PROJECT_ID})"

# ── Carregar .env existente para defaults ─────────────────────────────────────

if [ -f "$ENV_FILE" ]; then
  log_info "Carregando configurações existentes do .env..."
  set -a; source <(grep -v '^#' "$ENV_FILE" | grep '='); set +a
fi

# ── 2. Credenciais Supabase ───────────────────────────────────────────────────

log_step "2. CREDENCIAIS SUPABASE"
ask "Anon/Public Key" "SUPABASE_PUBLISHABLE_KEY" "$VITE_SUPABASE_PUBLISHABLE_KEY" "false"
ask "Service Role Key" "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "true"
ask "Database Password" "SUPABASE_DB_PASSWORD" "$SUPABASE_DB_PASSWORD" "true"

# ── 3. Segurança & Antibot ────────────────────────────────────────────────────

log_step "3. SEGURANÇA & ANTIBOT"
ask "Turnstile Site Key"   "TURNSTILE_SITE_KEY"   "$VITE_TURNSTILE_SITE_KEY" "false"
ask "Turnstile Secret Key" "TURNSTILE_SECRET_KEY" "$TURNSTILE_SECRET_KEY"    "true"
ask "ZenRows API Key"      "ZENROWS_API_KEY"      "$ZENROWS_API_KEY"         "true"
ask "IPInfo Token"         "IPINFO_TOKEN"         "$IPINFO_TOKEN"            "true"

# ── 4. Mensageria (Risenew) ───────────────────────────────────────────────────

log_step "4. MENSAGERIA (RISENEW)"
ask "API Key 1"    "RISENEW_API_KEY"    "$RISENEW_API_KEY"    "true"
ask "API Secret 1" "RISENEW_API_SECRET" "$RISENEW_API_SECRET" "true"
ask "Sender 1"     "RISENEW_SENDER"     "$RISENEW_SENDER"     "false"
ask "API Key 2"    "RISENEW_API_KEY_2"    "$RISENEW_API_KEY_2"    "true"
ask "API Secret 2" "RISENEW_API_SECRET_2" "$RISENEW_API_SECRET_2" "true"
ask "Sender 2"     "RISENEW_SENDER_2"     "$RISENEW_SENDER_2"     "false"

# ── 5. Marketing & Tracking ───────────────────────────────────────────────────

log_step "5. MARKETING & TRACKING"
ask "Meta Pixel ID"   "META_PIXEL_ID"          "$META_PIXEL_ID"          "false"
ask "Meta CAPI Token" "META_CAPI_ACCESS_TOKEN" "$META_CAPI_ACCESS_TOKEN" "true"

# ── Gerar .env ────────────────────────────────────────────────────────────────

cat > "$ENV_FILE" <<EOF
# Gerado automaticamente em $(date)
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_URL=https://${SUPABASE_PROJECT_ID}.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}

VITE_TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY}
TURNSTILE_SECRET_KEY=${TURNSTILE_SECRET_KEY}
ZENROWS_API_KEY=${ZENROWS_API_KEY}
IPINFO_TOKEN=${IPINFO_TOKEN}

RISENEW_API_KEY=${RISENEW_API_KEY}
RISENEW_API_SECRET=${RISENEW_API_SECRET}
RISENEW_SENDER=${RISENEW_SENDER}
RISENEW_API_KEY_2=${RISENEW_API_KEY_2}
RISENEW_API_SECRET_2=${RISENEW_API_SECRET_2}
RISENEW_SENDER_2=${RISENEW_SENDER_2}

META_PIXEL_ID=${META_PIXEL_ID}
META_CAPI_ACCESS_TOKEN=${META_CAPI_ACCESS_TOKEN}
EOF

log_success "Arquivo .env salvo."

# ── Deploy Supabase ───────────────────────────────────────────────────────────

SUPABASE="npx supabase"
log_step "DEPLOY: SUPABASE INFRA"

log_info "Vinculando projeto..."
$SUPABASE link --project-ref "$SUPABASE_PROJECT_ID" --password "$SUPABASE_DB_PASSWORD"

log_info "Sincronizando Secrets..."
$SUPABASE secrets set \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  TURNSTILE_SECRET_KEY="$TURNSTILE_SECRET_KEY" \
  ZENROWS_API_KEY="$ZENROWS_API_KEY" \
  IPINFO_TOKEN="$IPINFO_TOKEN" \
  RISENEW_API_KEY="$RISENEW_API_KEY" \
  RISENEW_API_SECRET="$RISENEW_API_SECRET" \
  RISENEW_SENDER="$RISENEW_SENDER" \
  RISENEW_API_KEY_2="$RISENEW_API_KEY_2" \
  RISENEW_API_SECRET_2="$RISENEW_API_SECRET_2" \
  RISENEW_SENDER_2="$RISENEW_SENDER_2" \
  META_PIXEL_ID="$META_PIXEL_ID" \
  META_CAPI_ACCESS_TOKEN="$META_CAPI_ACCESS_TOKEN" \
  --project-ref "$SUPABASE_PROJECT_ID"

log_info "Aplicando migrations..."
$SUPABASE db push --password "$SUPABASE_DB_PASSWORD"

log_info "Deployando edge functions..."
$SUPABASE functions deploy --project-ref "$SUPABASE_PROJECT_ID"

# ── Build Frontend ────────────────────────────────────────────────────────────

log_step "DEPLOY: FRONTEND BUILD"
if command -v bun &>/dev/null; then
  log_info "Usando Bun..."
  bun install && bun run build
else
  log_info "Usando NPM..."
  npm install && npm run build
fi

# ── Apache / Admin Auth ───────────────────────────────────────────────────────

log_step "DEPLOY: APACHE / ADMIN SECURITY"
ask "Caminho de deploy" "DEPLOY_PATH" "/var/www/html/dist" "false"
ask "Usuário admin"     "HT_USER"     "admin"              "false"
ask "Senha admin"       "HT_PASS"     ""                   "true"

if command -v htpasswd &>/dev/null; then
  htpasswd -bc dist/.htpasswd "$HT_USER" "$HT_PASS"
else
  HT_HASH=$(openssl passwd -apr1 "$HT_PASS")
  echo "${HT_USER}:${HT_HASH}" > dist/.htpasswd
fi

cat > dist/.htaccess <<EOF
Options -Indexes
DirectoryIndex index.html

<Files ".htpasswd">
    Require all denied
</Files>

<If "%{REQUEST_URI} =~ m#^/admin#">
    AuthType Basic
    AuthName "Restricted Access"
    AuthUserFile ${DEPLOY_PATH}/.htpasswd
    Require valid-user
</If>

RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
EOF

log_success "Configuração concluída!"
echo -e "\n${BOLD}Próximos passos:${NC}"
echo -e "  1. Mova ${CYAN}dist/${NC} para ${YELLOW}${DEPLOY_PATH}${NC}"
echo -e "  2. Garanta que o Apache tem permissão de leitura."
echo -e "  3. Acesse: ${GREEN}https://seu-dominio.com/admin${NC}\n"
