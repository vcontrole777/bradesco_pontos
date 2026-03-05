#!/bin/bash
# set-secrets.sh — Configura os Supabase Secrets via CLI
# Lê o project ID do .env e gera/executa o comando npx supabase secrets set

set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'
CYAN='\033[0;36m'; YELLOW='\033[0;33m'; NC='\033[0m'

log_info()    { echo -e "\033[0;34minfo\033[0m    $1"; }
log_success() { echo -e "${GREEN}✓${NC}       $1"; }
log_error()   { echo -e "${RED}✗ erro${NC}  $1" >&2; }

ask_secret() {
  local label=$1 var_name=$2
  echo -ne "${BOLD}${label}${NC} ${YELLOW}(oculto)${NC}: "
  read -rs input; echo ""
  eval "$var_name=\"$input\""
}

ask_plain() {
  local label=$1 var_name=$2 default=$3
  echo -ne "${BOLD}${label}${NC} ${CYAN}[${default:-vazio}]${NC}: "
  read -r input
  eval "$var_name=\"${input:-$default}\""
}

clear
echo -e "${BOLD}${CYAN}"
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║       SUPABASE SECRETS — CONFIGURAÇÃO          ║"
echo "  ╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Ler project ID do .env ────────────────────────────────────────────────────
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  log_error "Arquivo .env não encontrado. Configure o .env antes de rodar este script."
  exit 1
fi

PROJECT_ID=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
if [ -z "$PROJECT_ID" ]; then
  log_error "VITE_SUPABASE_PROJECT_ID não encontrado no .env."
  exit 1
fi

log_info "Projeto: ${CYAN}${PROJECT_ID}${NC}"
echo ""

# ── Coletar secrets ───────────────────────────────────────────────────────────
echo -e "${BOLD}── Supabase ──────────────────────────────────────${NC}"
ask_secret "Service Role Key"   SUPABASE_SERVICE_ROLE_KEY

echo ""
echo -e "${BOLD}── Cloudflare Turnstile ──────────────────────────${NC}"
ask_secret "Turnstile Secret Key" TURNSTILE_SECRET_KEY

echo ""
echo -e "${BOLD}── Risenew SMS — Perfil 1 ────────────────────────${NC}"
ask_secret "API Key 1"    RISENEW_API_KEY
ask_secret "API Secret 1" RISENEW_API_SECRET
ask_plain  "Sender 1"     RISENEW_SENDER "Bradesco"

echo ""
echo -e "${BOLD}── Risenew SMS — Perfil 2 ────────────────────────${NC}"
ask_secret "API Key 2"    RISENEW_API_KEY_2
ask_secret "API Secret 2" RISENEW_API_SECRET_2
ask_plain  "Sender 2"     RISENEW_SENDER_2 "Livelo"

echo ""
echo -e "${BOLD}── IPInfo ────────────────────────────────────────${NC}"
ask_secret "IPInfo Token" IPINFO_TOKEN

echo ""
echo -e "${BOLD}── ZenRows ───────────────────────────────────────${NC}"
ask_secret "ZenRows API Key" ZENROWS_API_KEY

echo ""
echo -e "${BOLD}── Meta CAPI ─────────────────────────────────────${NC}"
ask_plain  "Meta Pixel ID"   META_PIXEL_ID ""
ask_secret "CAPI Access Token" META_CAPI_ACCESS_TOKEN

# ── Exibir comando gerado ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━ COMANDO GERADO ━━━${NC}"
echo ""
echo -e "${CYAN}npx supabase secrets set \\"
echo "  SUPABASE_SERVICE_ROLE_KEY=\"${SUPABASE_SERVICE_ROLE_KEY}\" \\"
echo "  TURNSTILE_SECRET_KEY=\"${TURNSTILE_SECRET_KEY}\" \\"
echo "  RISENEW_API_KEY=\"${RISENEW_API_KEY}\" \\"
echo "  RISENEW_API_SECRET=\"${RISENEW_API_SECRET}\" \\"
echo "  RISENEW_SENDER=\"${RISENEW_SENDER}\" \\"
echo "  RISENEW_API_KEY_2=\"${RISENEW_API_KEY_2}\" \\"
echo "  RISENEW_API_SECRET_2=\"${RISENEW_API_SECRET_2}\" \\"
echo "  RISENEW_SENDER_2=\"${RISENEW_SENDER_2}\" \\"
echo "  IPINFO_TOKEN=\"${IPINFO_TOKEN}\" \\"
echo "  ZENROWS_API_KEY=\"${ZENROWS_API_KEY}\" \\"
echo "  META_PIXEL_ID=\"${META_PIXEL_ID}\" \\"
echo "  META_CAPI_ACCESS_TOKEN=\"${META_CAPI_ACCESS_TOKEN}\" \\"
echo -e "  --project-ref ${PROJECT_ID}${NC}"
echo ""

# ── Confirmar execução ────────────────────────────────────────────────────────
read -rp "$(echo -e "${BOLD}Executar agora? [s/N]:${NC} ")" _CONFIRM

if [ "$_CONFIRM" = "s" ] || [ "$_CONFIRM" = "S" ]; then
  echo ""
  log_info "Configurando secrets..."
  npx supabase secrets set \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    TURNSTILE_SECRET_KEY="$TURNSTILE_SECRET_KEY" \
    RISENEW_API_KEY="$RISENEW_API_KEY" \
    RISENEW_API_SECRET="$RISENEW_API_SECRET" \
    RISENEW_SENDER="$RISENEW_SENDER" \
    RISENEW_API_KEY_2="$RISENEW_API_KEY_2" \
    RISENEW_API_SECRET_2="$RISENEW_API_SECRET_2" \
    RISENEW_SENDER_2="$RISENEW_SENDER_2" \
    IPINFO_TOKEN="$IPINFO_TOKEN" \
    ZENROWS_API_KEY="$ZENROWS_API_KEY" \
    META_PIXEL_ID="$META_PIXEL_ID" \
    META_CAPI_ACCESS_TOKEN="$META_CAPI_ACCESS_TOKEN" \
    --project-ref "$PROJECT_ID"
  log_success "Secrets configurados com sucesso."
else
  log_info "Comando não executado. Copie e execute manualmente quando quiser."
fi

echo ""
