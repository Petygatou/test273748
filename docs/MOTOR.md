# O motor analítico

Tudo fica em `src/engine/` (TypeScript puro, sem dependências). Entrada: a temporada normalizada (`SeasonData`: atletas, clubes, jogos e o histórico de scouts por rodada). Saída: `RoundAnalysis` (forças dos times, odds de cada jogo, cedência, projeção completa de cada atleta e os parâmetros para simular qualquer tropa).

```
dados → modelo de times → cedência → modelo de atleta → Monte Carlo → MPV → otimizador
                                                          ↑
                                         backtest walk-forward + auto-ajuste
```

## 1. Modelo de times (`teamModel.ts`)

- **Poisson bidirecional** (Dixon & Coles): `log λ = μ + mando + ataque[time] + defesa[adversário]`, ajustado por máxima verossimilhança penalizada (prior ridge que encolhe os efeitos para a média da liga) com **decaimento temporal** (meia-vida de 10 rodadas).
- O alvo mistura gols reais com um **xG por finalizações** derivado dos scouts (FD + G + 0,5·FT + 0,22·FF, calibrado para a média de gols da liga). Placar é ruidoso; finalização é sinal.
- **Correção de Dixon-Coles (ρ)** para placares baixos, estimada por busca em grade.
- Cada jogo vira uma **matriz de placares** → vitória/empate/derrota, chance de SG de cada lado, placar mais provável, over 2,5, bônus de vitória do técnico.
- O mesmo ajustador modela o **volume de cada scout por time** (desarmes, finalizações, faltas, defesas do goleiro, impedimentos…) — é isso que mede quanto cada adversário cede de cada scout.

## 2. Cedência posicional (`cedencia.ts`)

- Pontos médios que os atletas de cada posição fazem contra cada time: geral, em casa, fora e últimos 5, com **shrinkage** para a média da liga (10 "jogos de atleta" de prior) — três jogos ruins não fazem uma defesa ruim.
- Por scout, a cedência é medida como **resíduo de participação**: "dos desarmes que os adversários deste time fazem, quantos ficam com os laterais vs. o normal da liga". Isso é independente do volume total (que vem do modelo de times) e evita contar o mesmo efeito duas vezes.

## 3. Modelo de atleta (`playerModel.ts`)

Em vez de prever "pontos" (alvo muito ruidoso), projeta **cada scout** e soma com os pesos oficiais:

```
taxa_i = (Σ w_g · s_ig / M_g  +  m · prior_pos · q_i · minutos_i) / (Σ w_g + m)
```

| Termo | O que faz |
|---|---|
| `w_g` | peso de recência (forma recente) |
| `M_g` | contexto do jogo g já disputado: um desarme contra quem mais cede desarmes vale menos (**ajuste pela força do adversário enfrentado**) |
| `m` | força do prior por **Bayes empírico (Gamma-Poisson)**, estimada dos dados por posição e scout: gol é muito mais encolhido que desarme |
| `q_i` | qualidade implícita no **preço** (o mercado sabe algo no começo da temporada), normalizada |
| `minutos_i` | **proxy de minutos** pelo volume de scouts por aparição (a API não dá minutos por jogo): reserva que sai do banco não herda o prior de titular |

- **Gols e assistências**: participação do atleta nos gols do time × gols esperados do time **neste** confronto. G, A, SG e GS ficam coerentes com o placar.
- **SG**: chance de não sofrer gol × **elegibilidade individual** (fração das chances de SG que o atleta de fato recebeu — quem entra no fim raramente leva).
- **Técnico**: média esperada dos atletas do clube que entram (ponderada pela chance de jogar) + 1 × chance de vitória.
- **Chance de jogar**: status oficial + participação recente com decaimento + prováveis do Painel ADM; para goleiros, a soma por clube é normalizada (só um joga).
- **Alertas**: pendurado (2 amarelos), dúvida, sem jogo, sem entrar em campo nos últimos jogos, confronto ofensivo difícil, boa chance de SG.

## 4. Monte Carlo (`simulate.ts`)

Milhares de rodadas simuladas: placar sorteado da matriz Dixon-Coles, gols distribuídos entre os atletas (thinning binomial), demais scouts por **binomial negativa** com sobredispersão estimada dos dados. Resultado: a distribuição completa de cada atleta (dado que joga) — **piso = P15, teto = P85**, P95, chance de negativar, 5+, 8+, 12+ e de bater o MPV.

A mesma engine simula **uma tropa inteira** com as correlações certas (atletas do mesmo time sobem e descem juntos; gols são mutuamente exclusivos entre companheiros), substituição pelo banco e a regra da **reserva de luxo**.

## 5. MPV e valorização (`pmv.ts`)

A valorização segue `V = CPP × (pontos − MPV)`, com o MPV dependendo do preço e da média. Se a API trouxer o MPV oficial (Gato Mestre), ele é usado; senão a fórmula é **recalibrada a cada rodada por regressão sobre o mercado inteiro** e o R² fica exposto. Valorização esperada = chance de jogar × CPP × (xP se jogar − MPV).

## 6. Auditoria das regras (`rulesCheck.ts`)

A cada análise o motor recalcula os pontos de cada linha do histórico a partir dos scouts e compara com a pontuação oficial, além de **estimar os pesos por mínimos quadrados**. Se a Globo mudar o valor de um scout, a divergência aparece na página Precisão do modelo. Se os scouts chegarem acumulados em vez de por rodada, são convertidos automaticamente.

## 7. Otimizador exato (`optimizer.ts`)

Programação dinâmica sobre **fronteiras de Pareto (custo × valor)** por posição, com uma flag de "capitão já escolhido" e poda por dominância; as fronteiras são combinadas e a última usa busca binária no orçamento. Garante o **ótimo global** com precisão de centavos (o teste compara com força bruta) em ~20–130 ms para os 7 esquemas.

| Perfil | Valor de cada atleta |
|---|---|
| Mitada | chance de jogar × (média + ½ do caminho até o teto) |
| Equilibrada | chance de jogar × (média − ¼ da distância até o piso) × penalidade de incerteza de escalação |
| Valorização | variação esperada de preço + 0,12 × xP |

O capitão entra **dentro** da otimização (bônus de 0,5 × métrica do perfil). Banco: um reserva por posição com preço ≤ titular mais barato da posição, escolhido pelo ganho esperado cobrindo ausências; o reserva de luxo é o de maior `E[max(0, reserva − pior titular)]`.

## 8. Validação: backtest walk-forward (`backtest.ts`)

Para cada rodada passada o modelo só enxerga o que aconteceu **antes** dela (status "honesto": provável se jogou em alguma das 3 últimas rodadas), projeta e é comparado com o real e com o método mais comum, **escalar pela média**. O teste definitivo: montar a tropa ótima (C$ 120, perfil Equilibrada) com o modelo e com a média, sem saber quem jogou, e somar os pontos **reais**.

Resultado na temporada de demonstração (rodadas 16 a 30, 4.438 previsões):

| Métrica | Modelo | Média da temporada |
|---|---|---|
| **Pontos reais da tropa por rodada** | **79,3** | 68,9 (**+15%**) |
| RMSE (regra própria para média) | 3,99 | 4,07 |
| Ordenação dentro da posição (Spearman) | 0,267 | 0,246 |
| MAE | 2,94 | 2,95 |
| Intervalo piso–teto (alvo 70%) | 69,6% dentro · 16,3% abaixo · 14,0% acima | — |

Observações honestas:
- Pontos de fantasy são muito ruidosos; nenhum modelo "acerta" a pontuação de um atleta. O ganho aparece onde importa: **ordenar** melhor e **montar tropas** que pontuam mais.
- O MAE favorece quem subestima gols (a distribuição é assimétrica), por isso o critério do auto-ajuste é o RMSE.
- Esses números são da temporada sintética. Rode `npm run backtest -- --live` com a API do Cartola acessível para medir na temporada real e `npm run tune -- --live` para recalibrar meia-vida, shrinkage e peso do contexto.

## Configuração (`ModelConfig`)

`halfLife` 10 · `shrinkScale` 1 · `contextStrength` 0,75 · `xgBlend` 0,5 · `teamHalfLife` 10 · `simulations` 3000 · `opponentAdjust` true.
