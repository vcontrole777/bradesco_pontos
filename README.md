# Livelo Redeem Flow

SPA de fluxo de resgate de pontos Livelo, construída com React + Vite + TypeScript e Supabase como backend completo (banco de dados, edge functions, realtime).

## Índice

- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [1. Configurar o Supabase](#1-configurar-o-supabase)
- [2. Variáveis de Ambiente](#2-variáveis-de-ambiente)
- [3. Desenvolvimento Local](#3-desenvolvimento-local)
- [4. Build de Produção](#4-build-de-produção)
- [5. Deploy no Apache](#5-deploy-no-apache)
- [Painel Admin](#painel-admin)
- [Edge Functions](#edge-functions)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend / DB | Supabase (PostgreSQL, Edge Functions, Realtime) |
| Gerenciador de pacotes | Bun |
| Servidor web | Apache 2.4 |

---

## Pré-requisitos

| Ferramenta | Versão mínima | Instalação |
|------------|--------------|-----------|
| [Bun](https://bun.sh) | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | 1.200+ | `npm i -g supabase` |
| Apache | 2.4+ | `apt install apache2` |
| `mod_rewrite` / `mod_headers` | — | `a2enmod rewrite headers` |

---

## 1. Configurar o Supabase

### 1.1 Criar o projeto

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e crie um novo projeto.
2. Anote o **Project URL**, **Anon Key** e **Project Reference ID** em Settings → API.

### 1.2 Aplicar as migrations

As migrations criam todas as tabelas, políticas RLS, índices e funções PostgreSQL.

```bash
# Autentique a CLI com sua conta Supabase
supabase login

# Vincule ao projeto remoto (use o Project Reference ID)
supabase link --project-ref SEU_PROJECT_REF_ID

# Aplique todas as migrations em ordem
supabase db push
```

As migrations estão em `supabase/migrations/` e incluem:

| Migration | Conteúdo |
|-----------|---------|
| `*_2a0b56b2` | Tabela `otp_codes` |
| `*_7127a0b5` | Tabela `leads` |
| `*_2833444a` | Tabela `site_sessions` |
| `*_153101` | Tabela `access_config` |
| `*_160911` | Tabela `flow_config` |
| `*_165302` | Tabela `access_logs` |
| `*_173847` | Dados iniciais de `flow_config` |
| `*_220630` | Campos complementares |
| `20260302000000` | RLS, índices de performance, funções `append_tag_to_leads` e `get_lead_step_counts` |
| `20260303000000` | FK `site_sessions→leads` CASCADE, triggers `updated_at`, funções `append_to_config_list` e `batch_update_flow_steps` |

### 1.3 Deploy das Edge Functions

```bash
# Faz deploy de todas as funções de uma vez
supabase functions deploy
```

Cada função requer secrets configurados em **Supabase Dashboard → Edge Functions → Manage secrets**:

| Função | Secrets necessários |
|--------|-------------------|
| `enviar-otp` | `RISENEW_API_KEY`, `RISENEW_API_SECRET` |
| `enviar-sms` | `RISENEW_API_KEY`, `RISENEW_API_SECRET` |
| `verificar-turnstile` | `TURNSTILE_SECRET_KEY` |
| `consultar-cpf` | Credenciais da API de consulta de CPF |
| `consultar-segmento` | Credenciais da API bancária |
| `ip-info` | `IPINFO_TOKEN` (ipinfo.io) |
| `meta-capi` | `META_ACCESS_TOKEN`, `META_PIXEL_ID` |

---

## 2. Variáveis de Ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

| Variável | Onde encontrar |
|----------|---------------|
| `VITE_SUPABASE_URL` | Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Dashboard → Settings → API → anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Dashboard → Settings → General → Reference ID |
| `VITE_ADMIN_PASSWORD` | Defina uma senha forte para o painel `/admin` |
| `VITE_TURNSTILE_SITE_KEY` | [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile (opcional) |

> **Segurança:** nunca suba o `.env` para o repositório. O `.gitignore` já o exclui.
> As variáveis `VITE_*` são embutidas no bundle em tempo de build — não coloque segredos de servidor aqui.

---

## 3. Desenvolvimento Local

```bash
# Instalar dependências
bun install

# Iniciar o servidor de desenvolvimento (http://localhost:8080)
bun run dev
```

Para rodar o Supabase localmente (requer Docker):

```bash
supabase start        # sobe PostgreSQL + Studio em localhost
supabase stop         # encerra os containers
```

Quando usar o Supabase local, substitua as variáveis no `.env` pelos valores exibidos pelo `supabase start`.

---

## 4. Build de Produção

```bash
bun run build
```

O output é gerado em `dist/` — arquivos estáticos prontos para servir. Verifique o resultado localmente antes do deploy:

```bash
bun run preview    # serve dist/ em http://localhost:4173
```

---

## 5. Deploy no Apache

### 5.1 Copiar os arquivos para o servidor

```bash
# Exemplo: enviar via rsync para um servidor remoto
rsync -avz --delete dist/ usuario@seuservidor.com:/var/www/livelo/

# Ou copiar localmente se já estiver no servidor
sudo cp -r dist/* /var/www/livelo/
sudo chown -R www-data:www-data /var/www/livelo/
```

### 5.2 Criar o VirtualHost

Crie o arquivo `/etc/apache2/sites-available/livelo.conf`:

```apache
<VirtualHost *:80>
    ServerName seudominio.com
    DocumentRoot /var/www/livelo

    <Directory /var/www/livelo>
        Options -MultiViews -Indexes
        AllowOverride None
        Require all granted

        # SPA routing: encaminha todas as rotas desconhecidas para index.html.
        # O React Router então resolve a rota no client-side.
        # Arquivos e pastas que existem fisicamente em disco são servidos normalmente.
        FallbackResource /index.html
    </Directory>

    # Compressão de assets de texto
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript \
                                       application/json image/svg+xml
    </IfModule>

    # Cache longo para assets com hash no nome (gerados pelo Vite)
    <FilesMatch "\.(js|css|woff2?|ttf|png|jpg|webp|svg|ico)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>

    # index.html nunca deve ser cacheado (muda a cada deploy)
    <FilesMatch "^index\.html$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
        Header set Pragma "no-cache"
    </FilesMatch>

    ErrorLog  ${APACHE_LOG_DIR}/livelo-error.log
    CustomLog ${APACHE_LOG_DIR}/livelo-access.log combined
</VirtualHost>
```

### 5.3 Ativar o site e módulos

```bash
sudo a2enmod rewrite headers deflate
sudo a2ensite livelo.conf
sudo a2dissite 000-default.conf    # opcional: desativar o site padrão
sudo apache2ctl configtest          # verificar sintaxe antes de recarregar
sudo systemctl reload apache2
```

### 5.4 HTTPS com Let's Encrypt (recomendado)

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d seudominio.com
```

O Certbot cria automaticamente o VirtualHost na porta 443 e agenda a renovação do certificado.

### 5.5 Verificar funcionamento

```bash
# Rota raiz
curl -I https://seudominio.com/

# Rota deep-link do React Router (deve retornar 200 com HTML, não 404)
curl -I https://seudominio.com/admin
curl -I https://seudominio.com/inicio

# Assets estáticos devem ter Cache-Control: immutable
curl -I https://seudominio.com/assets/index-XXXXXX.js
```

### 5.6 Alternativa com `.htaccess`

Se você não tiver acesso ao VirtualHost (hospedagem compartilhada), crie `dist/.htaccess` **antes** de fazer o upload:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ /index.html [QSA,L]
```

---

## Painel Admin

Acesse `/admin` no navegador. A senha é definida pela variável de ambiente `VITE_ADMIN_PASSWORD`.

| Página | Caminho | Descrição |
|--------|---------|-----------|
| Dashboard | `/admin` | Métricas em tempo real: leads, online, funil por etapa |
| Leads | `/admin/leads` | Tabela de leads com busca, filtros por tag, paginação cursor e ações em lote |
| Acessos | `/admin/acessos` | Sessões ativas, histórico de IPs, bloqueio de IP com um clique |
| Controle | `/admin/controle` | Configurações de acesso, tracking (Meta Pixel / Google), SMS, textos e ordenação do fluxo |

> A autenticação do painel é client-side e baseada em `sessionStorage`.
> Para maior segurança em produção, considere proteger o prefixo `/admin` no Apache com `mod_auth_basic` ou autenticação via proxy reverso.

---

## Edge Functions

Todas as funções ficam em `supabase/functions/<nome>/index.ts` e são chamadas pelo frontend via `EdgeFunctionsService` (`src/services/edge-functions.service.ts`).

| Função | Descrição |
|--------|-----------|
| `enviar-otp` | Gera e envia OTP por SMS; verifica código informado |
| `verificar-turnstile` | Valida token Cloudflare Turnstile server-side |
| `consultar-cpf` | Retorna nome do titular pelo CPF |
| `consultar-segmento` | Retorna segmento bancário por agência/conta |
| `enviar-sms` | Envia SMS avulso (confirmação de resgate) |
| `ip-info` | Retorna IP, geolocalização e dados de privacidade (VPN/proxy/Tor) |
| `meta-capi` | Envia evento server-side para Meta Conversions API (deduplicação) |
