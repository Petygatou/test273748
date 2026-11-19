# Hospedagem e domínio

O Tropa é um servidor Node.js. Ele busca os dados no Cartola, calcula a rodada e guarda contas, Comunidade e Campinhos. Por isso, hospedagens que só servem arquivos (Hostinger Single e Premium) não rodam o site.

Há dois caminhos. Nos dois, cada mudança juntada na `main` do GitHub publica sozinha.

## Caminho 1 — Hostinger Business (site e domínio no mesmo lugar)

O **Business Web Hosting** é o plano mais barato da Hostinger com "Node.js web app" e deploy pelo GitHub. Não precisa de VPS.

1. **Contrate** em hostinger.com.br → Hospedagem de Sites → **Business**. Registre o domínio junto, se quiser.
2. **Crie o app.** No hPanel: **Websites → Adicionar site → Node.js web app → Importar repositório Git**.
3. **Conecte o GitHub.** Clique em **Conectar com GitHub**, instale o app da Hostinger e libere `Petygatou/test273748`. Escolha a branch **main**.
4. **Configure o build:**
   | Campo | Valor |
   |---|---|
   | Versão do Node | 22 |
   | Instalar | `npm install --include=dev` |
   | Build | `npm run build` |
   | Iniciar (start) | `npm start` |
5. **Variáveis de ambiente** (em "Environment variables"; veja a tabela abaixo). Na Hostinger **não** precisa de `KV_REST_API_URL`/`KV_REST_API_TOKEN`: os dados (contas, Comunidade, Campinhos) ficam no disco do servidor, na pasta `~/tropa-data`, fora da pasta do app, e não se perdem a cada deploy.
6. **Deploy.** A Hostinger dá um endereço provisório; abra e confira.
7. **Domínio.** Aponte o domínio para o app em **Domínios** e ative o **SSL** grátis.
8. **Teste os dados reais.** Entre como admin → **Painel ADM → Dados reais → Testar conexão com a Globo**. Se der bloqueio (403), use o relay da Cloudflare (`docs/CARTOLA.md`, saída 1).

Se ficar lento, baixe `SIMULATIONS` para `1000`. A hospedagem compartilhada tem limite de CPU.

## Caminho 2 — Domínio da Hostinger apontando para a Vercel

Para manter o site na Vercel e só comprar o domínio na Hostinger:

1. Na Vercel: projeto → **Settings → Domains → Add** → digite o domínio (ex.: `tropa.com.br`).
2. A Vercel mostra os registros DNS (um `A` para o domínio e um `CNAME` para o `www`).
3. Na Hostinger: **Domínios → DNS / Nameservers**. Apague os registros `A`/`CNAME` antigos com o mesmo nome e crie os que a Vercel mostrou.
4. Em até algumas horas o domínio abre o site, com https automático.

Confira também em **Settings → Git** da Vercel se a **Production Branch** é `main`.

## Variáveis de ambiente (as mesmas nos dois caminhos)

| Nome | Valor |
|---|---|
| `DATA_MODE` | `live` (só dados reais; nunca `auto` em produção) |
| `ADMIN_EMAILS` | e-mail do admin |
| `ADMIN_PASSWORD` | senha do admin (8+ caracteres) |
| `SESSION_SECRET` | texto aleatório longo |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | **só na Vercel** (Upstash Redis). Na Hostinger deixe sem: os dados ficam em `~/tropa-data` |
| `API_FOOTBALL_KEY` | opcional: escalações oficiais e lados dos laterais |
| `SIMULATIONS` | `1500` (ou `1000` em servidor fraco) |
| `CAKTO_WEBHOOK_SECRET` | segredo do webhook da Cakto (texto aleatório longo; o mesmo colado no webhook da Cakto). Veja `docs/PAGAMENTO.md` |
| `CARTOLA_API_HOSTS` / `CARTOLA_RELAY_KEY` | só se a Globo bloquear o servidor (relay da Cloudflare) |

Não defina `PORT`, `DATA_DIR` nem `NODE_ENV`. A hospedagem cuida da porta, e o servidor já liga em modo produção sozinho (`scripts/serve.mjs`). Com `NODE_ENV=production` na instalação, o npm pula as ferramentas de build (vite) e o build falha.
