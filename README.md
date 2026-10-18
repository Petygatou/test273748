# Comandante FC

Plataforma de inteligência para o **Cartola FC**: projeções scout a scout, simulação de Monte Carlo, otimizador **exato** de tropas, backtest público da precisão do modelo e o **Comandante**, um assistente de IA que só fala com os números do motor.

> **Princípio:** a matemática decide os números; a IA interpreta. Nenhuma métrica é inventada — o Comandante consulta o motor por ferramentas.

Stack: **TanStack Start v1** (React 19, SSR) · **Tailwind CSS v4** · **Vite 7** · **TanStack Query** · backend próprio em Node (banco em arquivo, sem serviços externos) · **Claude** (assistente).

---

## O que tem dentro

| Tela | Rota | Destaques |
|---|---|---|
| Início | `/` | Leitura da rodada: capitães, melhores por posição, jogos com probabilidades 1X2 e SG, valorização, diferenciais (pouco escalados), pendurados/dúvidas, alertas oficiais, precisão comprovada do modelo |
| Escalação | `/escalacao` | Otimizador exato (fronteira de Pareto) nos 7 esquemas, 3 perfis (Mitada, Equilibrada, Valorização), fixar/banir, capitão forçado, capitão justificado, banco + reserva de luxo, campinho com troca manual, distribuição simulada da tropa (P10–P90, chance de 60/70/80/90+), comparativo de esquemas, salvar tropa e **escalar direto no Cartola** |
| Estatísticas | `/estatisticas` | Mercado com filtros e faixa piso–teto · Duelo X1 com radar · Matriz de confrontos com próximos 4 jogos · Matriz de cedência posicional (geral/casa/fora/últimos 5) · Força dos times · Glossário + tabela de pontuação |
| Jogador | `/jogador/:id` | De onde vêm os pontos (scout a scout), distribuição, fatores do confronto, cedência do adversário à posição, últimas rodadas, próximos jogos, MPV e valorização |
| Precisão do modelo | `/modelo` | Backtest walk-forward vs. escalar pela média, calibração do intervalo, auditoria da tabela de pontos, calibração do MPV, metodologia |
| Ao Vivo | `/ao-vivo` | Parciais da tropa com substituição pelo banco, projeção do final da rodada, placares e destaques |
| Comandante | `/assistente` | Chat em streaming com ferramentas do motor; preferências de tom e foco; atalhos "Perguntar ao Comandante" em todas as telas |
| Notícias | `/noticias` | RSS processado no servidor (cache de 5 min), classificação por regra (desfalques, escalações, mercado…), atletas citados com impacto |
| Comunidade | `/comunidade` | Stories (upload, câmera, filtros, textos arrastáveis), feed com foto/vídeo, enquetes, curtidas e comentários em tempo real (SSE) |
| Meu Time | `/meu-time` | Conecta a conta do Cartola: seu time, patrimônio, pontos, comparação com a tropa ótima no seu patrimônio, minhas ligas e **times acompanhados com parciais ao vivo** |
| Ligas | `/ligas` | Busca de ligas e classificação (campeonato, rodada, mês, turno) |
| Painel ADM | `/admin` | **Prováveis escalações que alimentam o modelo**, publicações e stories oficiais, alertas de mercado com apoio do Comandante |
| Conta | `/conta` | Conta com e-mail e senha, perfil, 8 avatares ilustrados, preferências, tropas salvas na conta |

Também: PWA (manifest + ícone), auto-recuperação de versão (recarrega uma vez em erro de chunk), SyncBar com status do mercado/rodada/Modo Demonstração, layout mobile-first com navegação inferior.

---

## Como rodar

```bash
npm install          # .npmrc usa legacy-peer-deps
npm run dev          # http://localhost:3000
npm test             # 33 testes (motor, otimizador vs. força bruta, backtest, IA, contas, comunidade, API do Cartola)
npm run typecheck
npm run build && npm start   # servidor Node de produção (scripts/serve.mjs)
```

Scripts do motor:

```bash
npm run smoke                 # roda a análise completa e imprime diagnósticos
npm run backtest              # backtest walk-forward (temporada de demonstração)
npm run backtest -- --live    # backtest com a temporada REAL da API do Cartola
npm run tune -- --live        # busca em grade dos hiperparâmetros (RMSE)
```

Sem acesso à API do Cartola (pré-temporada, rede bloqueada) o app entra em **Modo Demonstração**: uma temporada sintética completa, com atletas fictícios, gerada a partir de uma "verdade latente" conhecida — útil para desenvolver e para provar que o modelo recupera o que gerou os dados.

## Configuração

Copie `.env.example` para `.env`:

| Variável | Para quê |
|---|---|
| `DATA_MODE` | `auto` (padrão: API oficial, cai para demonstração), `live` ou `demo` |
| `CARTOLA_API_HOSTS` | Hosts da API, em ordem de preferência (padrão: `https://api.cartolafc.globo.com,https://api.cartola.globo.com`) |
| `SIMULATIONS` | Simulações de Monte Carlo por rodada (padrão 3000; reduza em hosts com pouca CPU) |
| `DATA_DIR` | Pasta do banco, das mídias e dos snapshots (padrão `./data`) — faça backup dela |
| `ADMIN_EMAILS` | E-mails administradores (vírgula). Sem ela, a primeira conta criada vira administradora |
| `ANTHROPIC_API_KEY` | Liga o Comandante (sem ela, ele responde em modo offline com os números do motor) |
| `NEWS_FEEDS` | Lista de feeds RSS (padrão: buscas do Google Notícias) |

## API do Cartola

`src/server/cartolaHttp.ts` fala com **api.cartolafc.globo.com** e **api.cartola.globo.com** (mesma API), tentando o host que respondeu por último e caindo para o outro em falha de rede, 404 ou 5xx.

| Endpoint | Uso no app |
|---|---|
| `/mercado/status`, `/atletas/mercado`, `/partidas/{r}`, `/atletas/pontuados/{r}`, `/mercado/destaques` | Temporada completa para o motor (com cache longo para rodadas encerradas) |
| `/atletas/pontuados`, `/partidas` | Ao Vivo |
| `/pos-rodada/destaques`, `/rodadas`, `/esquemas`, `/clubes` | Mito da rodada, calendário, ids de esquema |
| `/times?q=`, `/time/id/{id}[/{rodada}]`, `/time/slug/{slug}[/{rodada}]` | Busca de times e parciais de qualquer time |
| `/ligas?q=` | Busca de ligas |
| `/auth/time`, `/auth/ligas`, `/auth/liga/{slug}` | Meu time, minhas ligas, classificação (token do cartoleiro) |
| `POST /auth/time/salvar` | Escalar a tropa do Montador direto no Cartola (`esquema`, `atletas`, `capitao`, reservas) |

O token do Cartola (cabeçalho `X-GLB-Token`/`Authorization` copiado do site) fica **só no navegador** do cartoleiro e é repassado pelo servidor apenas na chamada; nunca é gravado. A cada leitura do mercado aberto o servidor grava um **snapshot** (preço e status por atleta) em `DATA_DIR/snapshots`, que com o tempo reconstrói preço antes/depois de cada rodada e reforça a calibração do MPV.

## Backend próprio

Sem serviços externos: `src/server/db.ts` mantém as coleções em arquivos JSON em `DATA_DIR/db` (gravação atômica), `auth.ts` faz contas com senha **scrypt** e sessão em cookie **HttpOnly**, mídia vai para `DATA_DIR/media` (`POST /api/media`, entregue em `/media/:arquivo` com suporte a Range) e o tempo real sai por **Server-Sent Events** em `/api/events`. Para hospedar, qualquer servidor Node com disco persistente serve (`npm run build && npm start`).

## Estrutura

```
src/engine/       motor analítico (puro): regras, modelo de times, cedência, modelo de atleta,
                  Monte Carlo, MPV, auditoria de regras, otimizador, backtest
src/data/         temporada sintética do Modo Demonstração
src/server/       API do Cartola, banco e contas, comunidade, mídia, notícias, ao vivo, Comandante (IA), server functions
src/routes/       telas (TanStack Router, file-based), /api/comandante, /api/media, /api/events, /media
src/components/   UI: campinho, gráficos SVG, stories, avatares…
src/lib/          queries, formatação, armazenamento local, sessão, comunidade, alertas, tempo real
tests/            testes do motor, do Comandante, do backend e da API do Cartola
docs/             metodologia do motor e análise de concorrentes
```

Leia também: [`docs/MOTOR.md`](docs/MOTOR.md) (como o motor funciona e como foi validado) e [`docs/CONCORRENTES.md`](docs/CONCORRENTES.md) (o que os concorrentes fazem e onde o Comandante vai além).

## Hospedagem

O app é um servidor Node com banco em arquivo, upload e SSE, então precisa de disco persistente: **não use a Vercel/Netlify** (funções serverless, sem disco, dão 404). Use Render, Railway ou Fly.io. O repositório traz `Dockerfile` e `render.yaml` (Render: *New → Blueprint*, aponte para o repositório e o `ADMIN_EMAILS` já vem preenchido no `render.yaml`). Em qualquer host Docker, monte um volume em `/data`.

### Vercel (somente demonstração)

Com `VERCEL=1` o build usa o preset do Nitro e roda na Vercel, mas lá o disco é temporário (`/tmp`): contas, posts e fotos somem a cada reinício da função e o tempo real (SSE) não é confiável. Serve para ver as análises; para uso real, prefira o host com disco persistente acima.
