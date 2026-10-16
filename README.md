# Comandante FC

Plataforma de inteligência para o **Cartola FC**: projeções scout a scout, simulação de Monte Carlo, otimizador **exato** de tropas, backtest público da precisão do modelo e o **Comandante**, um assistente de IA que só fala com os números do motor.

> **Princípio:** a matemática decide os números; a IA interpreta. Nenhuma métrica é inventada — o Comandante consulta o motor por ferramentas.

Stack: **TanStack Start v1** (React 19, SSR) · **Tailwind CSS v4** · **Vite 7** · **TanStack Query** · **Lovable Cloud / Supabase** (opcional) · **Claude** (assistente).

---

## O que tem dentro

| Tela | Rota | Destaques |
|---|---|---|
| Início | `/` | Leitura da rodada: capitães, melhores por posição, jogos com probabilidades 1X2 e SG, valorização, diferenciais (pouco escalados), pendurados/dúvidas, alertas oficiais, precisão comprovada do modelo |
| Escalação | `/escalacao` | Otimizador exato (fronteira de Pareto) nos 7 esquemas, 3 perfis (Mitada, Equilibrada, Valorização), fixar/banir, capitão forçado, capitão justificado, banco + reserva de luxo, campinho com troca manual, distribuição simulada da tropa (P10–P90, chance de 60/70/80/90+), comparativo de esquemas, salvar tropa |
| Estatísticas | `/estatisticas` | Mercado com filtros e faixa piso–teto · Duelo X1 com radar · Matriz de confrontos com próximos 4 jogos · Matriz de cedência posicional (geral/casa/fora/últimos 5) · Força dos times · Glossário + tabela de pontuação |
| Jogador | `/jogador/:id` | De onde vêm os pontos (scout a scout), distribuição, fatores do confronto, cedência do adversário à posição, últimas rodadas, próximos jogos, MPV e valorização |
| Precisão do modelo | `/modelo` | Backtest walk-forward vs. escalar pela média, calibração do intervalo, auditoria da tabela de pontos, calibração do MPV, metodologia |
| Ao Vivo | `/ao-vivo` | Parciais da tropa com substituição pelo banco, projeção do final da rodada, placares e destaques |
| Comandante | `/assistente` | Chat em streaming com ferramentas do motor; preferências de tom e foco; atalhos "Perguntar ao Comandante" em todas as telas |
| Notícias | `/noticias` | RSS processado no servidor (cache de 5 min), classificação por regra (desfalques, escalações, mercado…), atletas citados com impacto |
| Comunidade | `/comunidade` | Stories (upload, câmera, filtros, textos arrastáveis), feed com foto/vídeo, enquetes, curtidas e comentários em tempo real |
| Painel ADM | `/admin` | **Prováveis escalações que alimentam o modelo**, publicações e stories oficiais, alertas de mercado com apoio do Comandante |
| Conta | `/conta` | Perfil, 8 avatares ilustrados, preferências, login no Lovable Cloud, tropas salvas |

Também: PWA (manifest + ícone), auto-recuperação de versão (recarrega uma vez em erro de chunk), SyncBar com status do mercado/rodada/Modo Demonstração, layout mobile-first com navegação inferior.

---

## Como rodar

```bash
npm install          # .npmrc usa legacy-peer-deps
npm run dev          # http://localhost:3000
npm test             # 26 testes (motor, otimizador vs. força bruta, backtest, ferramentas da IA)
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
| `SIMULATIONS` | Simulações de Monte Carlo por rodada (padrão 3000; reduza em hosts com pouca CPU) |
| `ANTHROPIC_API_KEY` | Liga o Comandante (sem ela, ele responde em modo offline com os números do motor) |
| `ADMIN_TOKEN` | Painel ADM sem Lovable Cloud |
| `NEWS_FEEDS` | Lista de feeds RSS (padrão: buscas do Google Notícias) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Lovable Cloud: login, comunidade compartilhada, alertas e prováveis persistentes |

### Lovable Cloud (Supabase)

1. Rode `supabase/migrations/20261016000000_comandante_fc.sql` (tabelas, RLS, papel de admin, bucket `media`, realtime).
2. Torne alguém administrador: `insert into public.user_roles (user_id, role) values ('<uuid>', 'admin');`
3. Defina as variáveis `VITE_SUPABASE_*`. Sem elas, a comunidade e os alertas funcionam em modo local (por navegador) e as prováveis ficam na memória do servidor.

## Levando para o projeto do Lovable

O coração da plataforma é `src/engine/` — **TypeScript puro, sem dependências**, que roda no servidor, no navegador ou em scripts. Para turbinar o projeto existente basta copiar `src/engine/` (e, se quiser, `src/server/cartolaApi.ts` para os dados reais) e chamar:

```ts
import { buildRoundAnalysis } from "./engine/analysis";
import { optimizeLineup } from "./engine/optimizer";

const analise = buildRoundAnalysis(temporada);              // projeções, odds, cedência, MPV…
const { lineup } = optimizeLineup(analise, { formation: "auto", budget: 120, profile: "equilibrada" });
```

Ou conecte o projeto do Lovable a este repositório pelo GitHub e use o app inteiro.

## Estrutura

```
src/engine/       motor analítico (puro): regras, modelo de times, cedência, modelo de atleta,
                  Monte Carlo, MPV, auditoria de regras, otimizador, backtest
src/data/         temporada sintética do Modo Demonstração
src/server/       API do Cartola, cache, notícias, ao vivo, Comandante (IA), server functions
src/routes/       telas (TanStack Router, file-based) e /api/comandante
src/components/   UI: campinho, gráficos SVG, stories, avatares…
src/lib/          queries, formatação, armazenamento local, Supabase, comunidade, alertas
supabase/         migração SQL do Lovable Cloud
tests/            testes do motor e do Comandante
docs/             metodologia do motor e análise de concorrentes
```

Leia também: [`docs/MOTOR.md`](docs/MOTOR.md) (como o motor funciona e como foi validado) e [`docs/CONCORRENTES.md`](docs/CONCORRENTES.md) (o que os concorrentes fazem e onde o Comandante vai além).
