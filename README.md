# Livelo Redeem Flow

SPA de fluxo de resgate de pontos Livelo com painel administrativo em tempo real.

## Funcionalidades

- Fluxo configurável de etapas (CPF → OTP → dados bancários → resgate → assinatura → biometria)
- Verificação de CPF e segmento bancário
- Envio de OTP por SMS
- Painel admin com leads em tempo real, presença online e gerenciamento do fluxo
- Suporte a múltiplos segmentos Bradesco (Prime, Exclusive, Private)
- CAPTCHA via Cloudflare Turnstile (opcional)
- Geolocalização de visitantes via IPInfo

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend / DB | Supabase (PostgreSQL, Edge Functions, Realtime) |
| Servidor web | Apache 2.4 |

---

## Instalação

### Pré-requisitos

| Ferramenta | Instalação |
|---|---|
| Node.js 18+ | [nodejs.org](https://nodejs.org) |
| Supabase CLI | `npm i -g supabase` |
| Conta Supabase | [supabase.com](https://supabase.com) |

### Serviços necessários (tenha as chaves em mãos antes de rodar o setup)

| Serviço | Para que serve | Obrigatório |
|---|---|---|
| [Supabase](https://supabase.com/dashboard) → Settings → API | banco + edge functions | sim |
| [Risenew](https://risenew.lat) | envio de SMS / OTP | sim |
| [IPInfo](https://ipinfo.io/account/token) | geolocalização de visitantes | sim |
| [ZenRows](https://app.zenrows.com) | consulta de segmento bancário | sim |
| [Cloudflare Turnstile](https://dash.cloudflare.com) → Turnstile | CAPTCHA anti-bot | não |

### Setup

```bash
git clone <url-do-repo>
cd livelo-redeem-flow
chmod +x setup.sh
./setup.sh
```

O script pergunta todas as credenciais no terminal, gera o `.env` automaticamente e executa:

1. Conecta ao projeto Supabase (`supabase link`)
2. Configura os secrets das edge functions (`supabase secrets set`)
3. Aplica as migrations no banco (`supabase db push`)
4. Faz deploy das edge functions (`supabase functions deploy`)
5. Instala dependências e builda o frontend (`npm install && npm run build`)

Ao final, sirva a pasta `dist/` com seu servidor web.

---

## Configuração do servidor web

### Apache

```apache
<VirtualHost *:80>
    ServerName seudominio.com
    DocumentRoot /caminho/para/dist

    <Directory /caminho/para/dist>
        Options -MultiViews -Indexes
        AllowOverride None
        Require all granted
        FallbackResource /index.html
    </Directory>
</VirtualHost>
```

### nginx

```nginx
server {
    listen 80;
    server_name seudominio.com;
    root /caminho/para/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Painel Admin

Acesse `/admin` com a senha definida em `VITE_ADMIN_PASSWORD`.

| Página | Descrição |
|---|---|
| `/admin` | Métricas em tempo real: leads, online, funil por etapa |
| `/admin/leads` | Tabela de leads com busca, filtros, paginação e ações em lote |
| `/admin/acessos` | Sessões ativas, histórico de IPs, bloqueio de IP |
| `/admin/controle` | Configurações de acesso, tracking, SMS e ordenação do fluxo |

---

## Configuração do fluxo

As etapas são controladas pela tabela `flow_config`. Pelo painel em `/admin/controle` você habilita, desabilita e reordena cada etapa sem alterar código.

| step_key | Descrição | Padrão |
|---|---|---|
| `splash` | Tela inicial | habilitado |
| `inicio` | Coleta de CPF | habilitado |
| `otp` | Verificação por SMS | habilitado |
| `dados-bancarios` | Agência e conta | habilitado |
| `resgate` | Seleção da opção de resgate | habilitado |
| `senha` | Senha numérica separada | **desabilitado** (coletado no modal de resgate) |
| `assinatura` | Assinatura digital | habilitado |
| `biometria` | Biometria facial | habilitado |
| `concluido` | Tela final | habilitado |

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Reference ID do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key do Supabase |
| `VITE_SUPABASE_URL` | URL do projeto (`https://<id>.supabase.co`) |
| `VITE_ADMIN_PASSWORD` | Senha do painel `/admin` |
| `VITE_TURNSTILE_SITE_KEY` | Site key do Cloudflare Turnstile (opcional) |
| `RISENEW_API_KEY` | API key do Risenew (edge function) |
| `RISENEW_API_SECRET` | API secret do Risenew (edge function) |
| `TURNSTILE_SECRET_KEY` | Secret key do Turnstile (edge function) |
| `IPINFO_TOKEN` | Token do IPInfo (edge function) |
| `ZENROWS_API_KEY` | API key do ZenRows (edge function) |

> Variáveis sem prefixo `VITE_` são usadas apenas pelas edge functions e nunca expostas no frontend.
