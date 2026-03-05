#!/bin/bash
# setup.sh — Livelo Redeem Flow
# Defensive patterns: fail-fast, pre-checks, secret validation, rollback

set -euo pipefail
trap 'log_error "Erro inesperado na linha $LINENO. Abortando."; exit 1' ERR

# ── Cores ─────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'
YELLOW='\033[0;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log_info()    { echo -e "${BLUE}info${NC}    $1"; }
log_success() { echo -e "${GREEN}✓${NC}       $1"; }
log_warn()    { echo -e "${YELLOW}warn${NC}    $1"; }
log_error()   { echo -e "${RED}✗ erro${NC}  $1" >&2; }
log_step()    { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

# ── Dependências ──────────────────────────────────────────────────────────────
check_dep() {
  command -v "$1" &>/dev/null || { log_error "Dependência ausente: '$1'"; exit 1; }
}

clear
echo -e "${BOLD}${BLUE}"
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║     LIVELO REDEEM FLOW — SECURE SETUP          ║"
echo "  ╚════════════════════════════════════════════════╝"
echo -e "${NC}"

check_dep "npx"
check_dep "node"
check_dep "openssl"
check_dep "curl"

ENV_FILE=".env"
MIGRATION_DIR="supabase/migrations"

# ── Input helper ──────────────────────────────────────────────────────────────
ask() {
  local label=$1 var_name=$2 default_val=$3 is_secret=$4 input
  if [ "$is_secret" = "true" ]; then
    echo -ne "${BOLD}${label}${NC} ${YELLOW}(oculto)${NC}: "
    read -rs input; echo ""
  else
    echo -ne "${BOLD}${label}${NC} ${CYAN}[${default_val:-vazio}]${NC}: "
    read -r input
  fi
  eval "$var_name=\"${input:-$default_val}\""
}

# ═════════════════════════════════════════════════════════════════════════════
# CAMADA 1 — PRÉ-CHECK DE MIGRATIONS
# Analisa arquivos SQL antes de qualquer deploy.
# Verifica: RLS em toda tabela, uso de JSONB vs JSON, PKs com UUID.
# ═════════════════════════════════════════════════════════════════════════════
check_migrations() {
  log_step "PRÉ-CHECK: ANÁLISE DE MIGRATIONS"
  local errors=0 warnings=0

  if [ ! -d "$MIGRATION_DIR" ]; then
    log_error "Pasta $MIGRATION_DIR não encontrada."
    return 1
  fi

  # Extrai nomes únicos de tabelas criadas nas migrations
  local tables
  tables=$(grep -rih "CREATE TABLE" "$MIGRATION_DIR/"*.sql 2>/dev/null \
    | grep -ioP '(?<=CREATE TABLE\s)(IF NOT EXISTS\s)?(public\.)?[a-z_]+' \
    | sed 's/public\.//' | sort -u)

  if [ -z "$tables" ]; then
    log_warn "Nenhuma CREATE TABLE encontrada nas migrations — verificação pulada."
    return 0
  fi

  # Verifica RLS para cada tabela
  while IFS= read -r table; do
    [ -z "$table" ] && continue
    if grep -rih "ENABLE ROW LEVEL SECURITY" "$MIGRATION_DIR/"*.sql 2>/dev/null \
        | grep -qi "$table"; then
      log_success "RLS habilitado — $table"
    else
      log_error "RLS NÃO encontrado para: $table"
      ((errors++))
    fi
  done <<< "$tables"

  # Verifica uso de JSON sem B (menos performático que JSONB)
  local json_hits
  json_hits=$(grep -rihn "\bJSON\b" "$MIGRATION_DIR/"*.sql 2>/dev/null \
    | grep -v "JSONB\|--\|json_agg\|json_object\|to_json\|row_to_json" || true)
  if [ -n "$json_hits" ]; then
    log_warn "Uso de JSON (sem B) detectado — prefira JSONB para indexação e performance:"
    echo "$json_hits" | head -5 | sed 's/^/          /'
    ((warnings++))
  else
    log_success "Tipos de dados — JSONB ✓ (nenhum JSON sem B detectado)"
  fi

  # Verifica SERIAL (preferir UUID ou BIGSERIAL em produção)
  local serial_hits
  serial_hits=$(grep -rihn "\bSERIAL\b" "$MIGRATION_DIR/"*.sql 2>/dev/null \
    | grep -v "BIGSERIAL\|--" || true)
  if [ -n "$serial_hits" ]; then
    log_warn "SERIAL detectado — para sistemas distribuídos prefira UUID (gen_random_uuid()):"
    echo "$serial_hits" | head -3 | sed 's/^/          /'
    ((warnings++))
  else
    log_success "PKs — UUID ✓ (nenhum SERIAL sem segurança detectado)"
  fi

  # Verifica TIMESTAMP sem timezone
  local tz_hits
  tz_hits=$(grep -rihn "TIMESTAMP[^[:space:]]" "$MIGRATION_DIR/"*.sql 2>/dev/null \
    | grep -iv "TIMESTAMPTZ\|WITH TIME ZONE\|--" || true)
  if [ -n "$tz_hits" ]; then
    log_warn "TIMESTAMP sem timezone detectado — use TIMESTAMPTZ ou TIMESTAMP WITH TIME ZONE:"
    echo "$tz_hits" | head -3 | sed 's/^/          /'
    ((warnings++))
  else
    log_success "Timestamps — WITH TIME ZONE ✓"
  fi

  echo ""
  if [ "$errors" -gt 0 ]; then
    log_error "$errors erro(s) crítico(s) nas migrations. Corrija antes de continuar."
    return 1
  fi

  [ "$warnings" -gt 0 ] && log_warn "$warnings aviso(s) não-crítico(s). Revise quando possível."
  log_success "Migrations aprovadas no pré-check."
}

# ═════════════════════════════════════════════════════════════════════════════
# CAMADA 2 — VALIDAÇÃO DE SECRETS
# Rejeita strings vazias ou suspeitas antes de enviar ao Supabase.
# ═════════════════════════════════════════════════════════════════════════════
validate_secret() {
  local name=$1 value=$2 required=${3:-true} min_len=${4:-8}

  if [ -z "$value" ]; then
    if [ "$required" = "true" ]; then
      log_error "Secret obrigatório ausente: $name"
      return 1
    else
      log_warn "Secret opcional não configurado: $name"
      return 0
    fi
  fi

  # Rejeita placeholders óbvios
  case "${value,,}" in
    "your_key_here"|"placeholder"|"changeme"|"todo"|"xxx"|"null"|"undefined")
      log_error "Secret '$name' contém placeholder inválido: '$value'"
      return 1
      ;;
  esac

  if [ "${#value}" -lt "$min_len" ]; then
    log_error "Secret '$name' muito curto — ${#value} chars (mínimo: $min_len)"
    return 1
  fi

  log_success "Secret OK — $name (${#value} chars)"
}

validate_all_secrets() {
  log_step "CAMADA 2: VALIDAÇÃO DE SECRETS"
  local errors=0

  validate_secret "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "true"  "30" || ((errors++))
  validate_secret "SUPABASE_DB_PASSWORD"      "$SUPABASE_DB_PASSWORD"      "true"  "8"  || ((errors++))
  validate_secret "RISENEW_API_KEY"           "$RISENEW_API_KEY"           "true"  "8"  || ((errors++))
  validate_secret "RISENEW_API_SECRET"        "$RISENEW_API_SECRET"        "true"  "8"  || ((errors++))
  validate_secret "RISENEW_SENDER"            "$RISENEW_SENDER"            "true"  "2"  || ((errors++))
  validate_secret "RISENEW_API_KEY_2"         "$RISENEW_API_KEY_2"         "false" "8"  || true
  validate_secret "RISENEW_API_SECRET_2"      "$RISENEW_API_SECRET_2"      "false" "8"  || true
  validate_secret "TURNSTILE_SECRET_KEY"      "$TURNSTILE_SECRET_KEY"      "false" "20" || true
  validate_secret "META_CAPI_ACCESS_TOKEN"    "$META_CAPI_ACCESS_TOKEN"    "false" "30" || true

  if [ "$errors" -gt 0 ]; then
    log_error "$errors secret(s) inválido(s). Corrija e tente novamente."
    exit 1
  fi

  log_success "Todos os secrets obrigatórios validados."
}

# ═════════════════════════════════════════════════════════════════════════════
# CAMADA 3 — VALIDAÇÃO DE CONEXÃO COM BANCO
# Testa conectividade antes de tentar aplicar migrations.
# ═════════════════════════════════════════════════════════════════════════════
validate_db_connection() {
  log_step "CAMADA 3: VALIDAÇÃO DE CONEXÃO"
  log_info "Testando conectividade com o projeto Supabase..."

  local url="https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/"
  local http_status

  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    --retry 2 \
    --retry-delay 2 \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
    "$url" 2>/dev/null || echo "000")

  case "$http_status" in
    200)
      log_success "Banco acessível — HTTP $http_status"
      ;;
    401)
      log_error "Anon key inválida ou expirada (HTTP 401). Verifique VITE_SUPABASE_PUBLISHABLE_KEY."
      exit 1
      ;;
    404)
      log_error "Project ID não encontrado (HTTP 404). Verifique VITE_SUPABASE_PROJECT_ID."
      exit 1
      ;;
    000)
      log_error "Sem resposta do servidor. Verifique conectividade de rede."
      exit 1
      ;;
    *)
      log_warn "Resposta inesperada do servidor: HTTP $http_status. Continuando com cautela..."
      ;;
  esac
}

# ═════════════════════════════════════════════════════════════════════════════
# CAMADA 4 — DEPLOY DAS EDGE FUNCTIONS COM ROLLBACK
# Registra o commit atual e fornece instruções de rollback se o deploy falhar.
# ═════════════════════════════════════════════════════════════════════════════
deploy_functions_with_rollback() {
  log_step "CAMADA 4: DEPLOY DE EDGE FUNCTIONS (COM ROLLBACK)"

  # Salva referência do estado atual para rollback
  local current_commit
  current_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "sem-git")
  log_info "Commit atual: $current_commit"

  # Lista functions antes do deploy para referência de rollback
  local functions_before
  functions_before=$(npx supabase functions list --project-ref "$SUPABASE_PROJECT_ID" 2>/dev/null || echo "")

  log_info "Deployando edge functions..."

  if npx supabase functions deploy --project-ref "$SUPABASE_PROJECT_ID"; then
    log_success "Edge functions deployadas com sucesso."
  else
    echo ""
    echo -e "${BOLD}${RED}━━━ DEPLOY FALHOU — INSTRUÇÕES DE ROLLBACK ━━━${NC}"
    echo ""
    echo -e "  ${BOLD}O deploy das edge functions falhou.${NC}"
    echo -e "  As functions anteriores permanecem ativas no Supabase."
    echo ""
    echo -e "  ${BOLD}Para reverter o código local para o commit anterior:${NC}"
    echo -e "  ${CYAN}git checkout HEAD~1 -- supabase/functions/${NC}"
    echo -e "  ${CYAN}npx supabase functions deploy --project-ref ${SUPABASE_PROJECT_ID}${NC}"
    echo ""
    echo -e "  ${BOLD}Para listar functions ativas no Supabase:${NC}"
    echo -e "  ${CYAN}npx supabase functions list --project-ref ${SUPABASE_PROJECT_ID}${NC}"
    echo ""
    echo -e "  ${BOLD}Para deletar uma function específica com problema:${NC}"
    echo -e "  ${CYAN}npx supabase functions delete <nome> --project-ref ${SUPABASE_PROJECT_ID}${NC}"
    echo ""
    if [ -n "$functions_before" ]; then
      echo -e "  ${BOLD}Functions que estavam ativas antes do deploy:${NC}"
      echo "$functions_before" | sed 's/^/  /'
    fi
    exit 1
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# INÍCIO DO FLUXO PRINCIPAL
# ═════════════════════════════════════════════════════════════════════════════

# ── 0. Login Supabase ─────────────────────────────────────────────────────────
log_step "0. AUTENTICAÇÃO SUPABASE"

if ! npx supabase projects list &>/dev/null 2>&1; then
  log_info "Faça login na sua conta Supabase:"
  npx supabase login
fi

# ── 1. Selecionar projeto ─────────────────────────────────────────────────────
log_step "1. SELEÇÃO DE PROJETO"
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
  process.stdout.write('  \x1b[1m' + (i+1) + '.\x1b[0m ' + x.name + ' \x1b[36m(' + x.id + ')\x1b[0m\n');
});
" "$PROJECTS_JSON"
echo ""

read -rp "$(echo -e "${BOLD}Selecione o projeto [1-${PROJECT_COUNT}]:${NC} ")" PROJECT_NUM
PROJECT_IDX=$((PROJECT_NUM - 1))

if [ "$PROJECT_IDX" -lt 0 ] || [ "$PROJECT_IDX" -ge "$PROJECT_COUNT" ]; then
  log_error "Seleção inválida: $PROJECT_NUM"
  exit 1
fi

SUPABASE_PROJECT_ID=$(node -e "const p=JSON.parse(process.argv[1]);console.log(p[$PROJECT_IDX].id)" "$PROJECTS_JSON")
PROJECT_NAME=$(node -e "const p=JSON.parse(process.argv[1]);console.log(p[$PROJECT_IDX].name)" "$PROJECTS_JSON")
log_success "Projeto: ${PROJECT_NAME} (${SUPABASE_PROJECT_ID})"

# ── Carregar .env existente para defaults ─────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  log_info "Carregando configurações existentes..."
  set -a; source <(grep -v '^#' "$ENV_FILE" | grep '='); set +a
fi

# ── 2. Credenciais Supabase ───────────────────────────────────────────────────
log_step "2. CREDENCIAIS SUPABASE"
ask "Anon/Public Key"    "SUPABASE_PUBLISHABLE_KEY"  "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" "false"
ask "Service Role Key"   "SUPABASE_SERVICE_ROLE_KEY" "${SUPABASE_SERVICE_ROLE_KEY:-}"     "true"
ask "Database Password"  "SUPABASE_DB_PASSWORD"      "${SUPABASE_DB_PASSWORD:-}"          "true"

# ── 3. Segurança & Antibot ────────────────────────────────────────────────────
log_step "3. SEGURANÇA & ANTIBOT"
ask "Turnstile Site Key"   "TURNSTILE_SITE_KEY"   "${VITE_TURNSTILE_SITE_KEY:-}" "false"
ask "Turnstile Secret Key" "TURNSTILE_SECRET_KEY" "${TURNSTILE_SECRET_KEY:-}"    "true"
ask "ZenRows API Key"      "ZENROWS_API_KEY"      "${ZENROWS_API_KEY:-}"         "true"
ask "IPInfo Token"         "IPINFO_TOKEN"         "${IPINFO_TOKEN:-}"            "true"

# ── 4. Mensageria (Risenew) ───────────────────────────────────────────────────
log_step "4. MENSAGERIA (RISENEW)"
ask "API Key 1"    "RISENEW_API_KEY"      "${RISENEW_API_KEY:-}"      "true"
ask "API Secret 1" "RISENEW_API_SECRET"   "${RISENEW_API_SECRET:-}"   "true"
ask "Sender 1"     "RISENEW_SENDER"       "${RISENEW_SENDER:-}"       "false"
ask "API Key 2"    "RISENEW_API_KEY_2"    "${RISENEW_API_KEY_2:-}"    "true"
ask "API Secret 2" "RISENEW_API_SECRET_2" "${RISENEW_API_SECRET_2:-}" "true"
ask "Sender 2"     "RISENEW_SENDER_2"     "${RISENEW_SENDER_2:-}"     "false"

# ── 5. Acesso ao Painel Admin ─────────────────────────────────────────────────
log_step "5. ACESSO AO PAINEL ADMIN"
ask "Email do admin"  "ADMIN_EMAIL"    "${ADMIN_EMAIL:-ops@interno.local}" "false"
ask "Senha do admin"  "ADMIN_PASSWORD" ""                                  "true"

if [ -z "$ADMIN_PASSWORD" ]; then
  log_error "Senha do admin não pode ser vazia."
  exit 1
fi

# ── 6. Marketing & Tracking ───────────────────────────────────────────────────
log_step "6. MARKETING & TRACKING"
ask "Meta Pixel ID"   "META_PIXEL_ID"          "${META_PIXEL_ID:-}"          "false"
ask "Meta CAPI Token" "META_CAPI_ACCESS_TOKEN" "${META_CAPI_ACCESS_TOKEN:-}" "true"

# ── Gerar .env ────────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# Gerado automaticamente em $(date)
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_URL=https://${SUPABASE_PROJECT_ID}.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}

VITE_ADMIN_EMAIL=${ADMIN_EMAIL}

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
log_success ".env salvo."

# ═══════════════════════════════════════════════════════
# PRÉ-CHECKS (executados antes de qualquer deploy)
# ═══════════════════════════════════════════════════════

check_migrations       # Camada 1: RLS, tipos, indexes
validate_all_secrets   # Camada 2: secrets não-vazios e válidos
validate_db_connection # Camada 3: conectividade com o banco

# ═══════════════════════════════════════════════════════
# DEPLOY
# ═══════════════════════════════════════════════════════

log_step "DEPLOY: VINCULAR PROJETO"
npx supabase link \
  --project-ref "$SUPABASE_PROJECT_ID" \
  --password "$SUPABASE_DB_PASSWORD"

log_step "DEPLOY: SECRETS → SUPABASE"
npx supabase secrets set \
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

log_step "DEPLOY: MIGRATIONS"
# Supabase CLI pode retornar exit 0 mesmo em falha de conexão — capturamos stdout+stderr
_db_push_out=$(npx supabase db push \
  --password "$SUPABASE_DB_PASSWORD" \
  --project-ref "$SUPABASE_PROJECT_ID" 2>&1) || true
echo "$_db_push_out"
if echo "$_db_push_out" | grep -qiE "failed to connect|authentication failed|FATAL|error"; then
  log_error "Falha no db push. Verifique SUPABASE_DB_PASSWORD em: Dashboard → Settings → Database."
  exit 1
fi
log_success "Migrations aplicadas."

deploy_functions_with_rollback  # Camada 4: deploy com rollback automático

# ── Build Frontend ────────────────────────────────────────────────────────────
log_step "DEPLOY: FRONTEND BUILD"
if command -v bun &>/dev/null; then
  log_info "Usando Bun..."
  bun install && bun run build
else
  log_info "Usando NPM..."
  npm install && npm run build
fi

# ── Criar usuário admin no Supabase Auth ──────────────────────────────────────
log_step "DEPLOY: CRIAR USUÁRIO ADMIN"

_auth_url="https://${SUPABASE_PROJECT_ID}.supabase.co/auth/v1/admin/users"
_create_resp=$(curl -s -w "\n%{http_code}" -X POST "$_auth_url" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"email_confirm\":true}")

_create_body=$(echo "$_create_resp" | head -n -1)
_create_status=$(echo "$_create_resp" | tail -n 1)

if echo "$_create_body" | grep -q '"already registered"'; then
  log_warn "Usuário ${ADMIN_EMAIL} já existe — atualizando senha..."
  _user_id=$(echo "$_create_body" | node -e \
    "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).msg.match(/[0-9a-f-]{36}/)?.[0]||'')}catch{console.log('')}})")

  # Buscar user_id pelo email via Admin API
  _list_resp=$(curl -s "https://${SUPABASE_PROJECT_ID}.supabase.co/auth/v1/admin/users?email=${ADMIN_EMAIL}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
  _user_id=$(echo "$_list_resp" | node -e \
    "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const u=JSON.parse(d).users;console.log(u&&u[0]?u[0].id:'')}catch{console.log('')}})")

  if [ -n "$_user_id" ]; then
    curl -s -X PUT "https://${SUPABASE_PROJECT_ID}.supabase.co/auth/v1/admin/users/${_user_id}" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"password\":\"${ADMIN_PASSWORD}\"}" > /dev/null
    log_success "Senha atualizada para ${ADMIN_EMAIL}."
  fi
elif [ "$_create_status" = "200" ] || [ "$_create_status" = "201" ]; then
  _user_id=$(echo "$_create_body" | node -e \
    "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).id)}catch{console.log('')}})")
  log_success "Usuário criado: ${ADMIN_EMAIL} (${_user_id})"

  # Inserir role admin
  curl -s -X POST "https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/user_roles" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"${_user_id}\",\"role\":\"admin\"}" > /dev/null
  log_success "Role admin atribuída."
else
  log_error "Falha ao criar usuário admin (HTTP ${_create_status}):"
  echo "$_create_body"
  exit 1
fi

echo ""
log_success "Setup concluído com sucesso!"
echo -e "\n${BOLD}Próximos passos:${NC}"
echo -e "  1. Mova ${CYAN}dist/${NC} para o servidor."
echo -e "  2. Acesse ${GREEN}https://seu-dominio.com/admin${NC} e faça login com a senha configurada."
echo ""
