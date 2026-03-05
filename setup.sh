#!/bin/bash

# --- Configurações de Cores e Estilo ---
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Função de Log ---
log_info() { echo -e "${BLUE}info${NC}  $1"; }
log_success() { echo -e "${GREEN}success${NC} $1"; }
log_error() { echo -e "${RED}error${NC}   $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}--- $1 ---${NC}"; }

# --- Verificação de Dependências ---
check_dep() {
  if ! command -v "$1" &> /dev/null; then
    log_error "A dependência '$1' não foi encontrada. Por favor, instale-a antes de continuar."
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

ENV_FILE=".env"

# --- Função para capturar valores com fallback ---
# Usage: ask "LABEL" "VAR_NAME" "DEFAULT_VALUE" "IS_SECRET"
ask() {
  local label=$1
  local var_name=$2
  local default_val=$3
  local is_secret=$4
  local input

  if [ "$is_secret" = "true" ]; then
    echo -ne "${BOLD}${label}${NC} ${YELLOW}(oculto)${NC}: "
    read -rs input
    echo ""
  else
    echo -ne "${BOLD}${label}${NC} ${CYAN}[${default_val}]${NC}: "
    read -r input
  fi

  # Se o input for vazio, usa o default
  val="${input:-$default_val}"
  eval "$var_name=\"$val\""
}

# --- Carregar .env existente ---
if [ -f "$ENV_FILE" ]; then
  log_info "Arquivo .env detectado. Carregando configurações atuais..."
  # Exporta variáveis temporariamente para o script ler
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

log_step "1. CONFIGURAÇÕES SUPABASE"
ask "Project ID" "SUPABASE_PROJECT_ID" "$VITE_SUPABASE_PROJECT_ID" "false"
ask "Anon/Public Key" "SUPABASE_PUBLISHABLE_KEY" "$VITE_SUPABASE_PUBLISHABLE_KEY" "false"
ask "Service Role Key" "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "true"
ask "Database Password" "SUPABASE_DB_PASSWORD" "$SUPABASE_DB_PASSWORD" "true"

log_step "2. SEGURANÇA & ANTIBOT"
ask "Turnstile Site Key" "TURNSTILE_SITE_KEY" "$VITE_TURNSTILE_SITE_KEY" "false"
ask "Turnstile Secret Key" "TURNSTILE_SECRET_KEY" "$TURNSTILE_SECRET_KEY" "false"
ask "ZenRows API Key" "ZENROWS_API_KEY" "$ZENROWS_API_KEY" "false"
ask "IPInfo Token" "IPINFO_TOKEN" "$IPINFO_TOKEN" "false"

log_step "3. MENSAGERIA (RISENEW)"
ask "Risenew API Key 1" "RISENEW_API_KEY" "$RISENEW_API_KEY" "true"
ask "Risenew API Secret 1" "RISENEW_API_SECRET" "$RISENEW_API_SECRET" "true"
ask "Risenew Sender 1" "RISENEW_SENDER" "$RISENEW_SENDER" "false"
ask "Risenew API Key 2" "RISENEW_API_KEY_2" "$RISENEW_API_KEY_2" "true"
ask "Risenew API Secret 2" "RISENEW_API_SECRET_2" "$RISENEW_API_SECRET_2" "true"
ask "Risenew Sender 2" "RISENEW_SENDER_2" "$RISENEW_SENDER_2" "false"

log_step "4. MARKETING & TRACKING"
ask "Meta Pixel ID" "META_PIXEL_ID" "$META_PIXEL_ID" "false"
ask "Meta CAPI Token" "META_CAPI_ACCESS_TOKEN" "$META_CAPI_ACCESS_TOKEN" "true"

# --- Geração do Arquivo .env ---
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

log_success "Arquivo .env atualizado com sucesso."

# --- Execução de Comandos Supabase ---
SUPABASE="npx supabase"

log_step "DEPLOY: SUPABASE INFRA"

log_info "Vinculando projeto..."
$SUPABASE link --project-ref "$SUPABASE_PROJECT_ID" --password "$SUPABASE_DB_PASSWORD"

log_info "Sincronizando Secrets (Edge Functions)..."
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
  META_CAPI_ACCESS_TOKEN="$META_CAPI_ACCESS_TOKEN" \
  --project-ref "$SUPABASE_PROJECT_ID"

log_info "Pushing Database Migrations..."
$SUPABASE db push --password "$SUPABASE_DB_PASSWORD"

log_info "Deploying Edge Functions..."
$SUPABASE functions deploy --project-ref "$SUPABASE_PROJECT_ID"

log_step "DEPLOY: FRONTEND BUILD"
if command -v bun &> /dev/null; then
  log_info "Usando Bun para instalação e build..."
  bun install && bun run build
else
  log_info "Usando NPM para instalação e build..."
  npm install && npm run build
fi

log_step "DEPLOY: APACHE / ADMIN SECURITY"
ask "Caminho de deploy (ex: /var/www/html/dist)" "DEPLOY_PATH" "/var/www/dist" "false"
ask "Usuário Admin" "HT_USER" "admin" "false"
ask "Senha Admin" "HT_PASS" "" "true"

# Gerar .htpasswd
if command -v htpasswd &> /dev/null; then
  htpasswd -bc dist/.htpasswd "$HT_USER" "$HT_PASS"
else
  HT_HASH=$(openssl passwd -apr1 "$HT_PASS")
  echo "${HT_USER}:${HT_HASH}" > dist/.htpasswd
fi

# Criar .htaccess profissional
cat > dist/.htaccess <<EOF
Options -Indexes
DirectoryIndex index.html

<Files ".htpasswd">
    Require all denied
</Files>

# Proteção do Painel Admin
<If "%{REQUEST_URI} =~ m#^/admin#">
    AuthType Basic
    AuthName "Restricted Access"
    AuthUserFile ${DEPLOY_PATH}/.htpasswd
    Require valid-user
</If>

# SPA Routing (Fallback para index.html)
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
EOF

log_success "Configuração concluída!"
echo -e "\n${BOLD}Próximos passos:${NC}"
echo -e "1. Mova a pasta ${CYAN}dist/${NC} para ${YELLOW}${DEPLOY_PATH}${NC}"
echo -e "2. Certifique-se que o Apache tem permissão de leitura."
echo -e "3. Acesse o painel em: ${GREEN}https://seu-dominio.com/admin${NC}\n"