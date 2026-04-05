# Poker Tracker — Guia de Deploy

## Requisitos do Servidor

- **Node.js** v18 ou superior
- **MySQL** 8.0 ou superior
- **pnpm** v8+ (ou npm/yarn)
- Acesso SSH ao servidor

---

## Variáveis de Ambiente Necessárias

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco de Dados (interno ao ambiente)
DATABASE_URL=mysql://usuario:senha@mysql-interno:3306/poker_tracker

# Autenticação (use uma string longa e aleatória)
JWT_SECRET=troque_por_uma_string_secreta_longa_e_aleatoria

# Google OAuth (opcional, recomendado)
GOOGLE_CLIENT_ID=seu_google_client_id
GOOGLE_CLIENT_SECRET=seu_google_client_secret

# OAuth Manus (legado)
VITE_APP_ID=seu_app_id_manus
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=seu_open_id
OWNER_NAME=seu_nome

# APIs internas Manus
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=sua_chave_api_manus
VITE_FRONTEND_FORGE_API_KEY=sua_chave_frontend_manus
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# Ambiente
NODE_ENV=production
PORT=3000
```

---

## Passos para Deploy

### 1. Transferir os arquivos

Faça upload de todos os arquivos para o servidor (exceto `node_modules/` e `dist/`).

### 2. Instalar dependências

```bash
npm install -g pnpm
pnpm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o arquivo .env com suas credenciais reais
nano .env
```

### 4. Criar o banco de dados

```sql
CREATE DATABASE poker_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Executar as migrações do banco

```bash
pnpm db:push
```

### 6. Fazer o build de produção

```bash
pnpm build
```

Isso gera:
- `dist/` — servidor Node.js compilado
- `client/dist/` — frontend React compilado (servido pelo servidor)

### 7. Iniciar o servidor

```bash
pnpm start
# ou com PM2 para manter rodando em background:
npm install -g pm2
pm2 start "pnpm start" --name poker-tracker
pm2 save
pm2 startup
```

---

## Estrutura após o Build

```
dist/
  index.js          ← Servidor Node.js (Express + tRPC)
client/dist/
  index.html        ← Frontend React compilado
  assets/           ← JS/CSS/imagens
```

O servidor Express serve automaticamente os arquivos do `client/dist/` em produção.

---

## Notas Importantes

- **Login por e-mail/senha**: Funciona sem OAuth.
- **Google OAuth**: Configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no Railway.
- **Redirect URI Google**: `https://seu-dominio.com/api/oauth/google/callback`
- **Banco de dados**: O projeto usa Drizzle ORM com MySQL. Certifique-se de que o usuário do banco tem permissões de CREATE, ALTER, INSERT, UPDATE, DELETE e SELECT.
- **Porta**: Por padrão usa a porta 3000. Configure um proxy reverso (Nginx/Apache) para apontar o domínio para essa porta.

---

## Proxy Reverso com Apache (cPanel/HostGator VPS)

Adicione no `.htaccess` ou configure no Apache:

```apache
<VirtualHost *:80>
    ServerName seudominio.com
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

Ou com Nginx:

```nginx
server {
    listen 80;
    server_name seudominio.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
