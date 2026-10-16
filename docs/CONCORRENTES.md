# Análise de concorrentes

> Os sites dos concorrentes estavam bloqueados pela rede do ambiente de desenvolvimento; a pesquisa foi feita por busca na web (outubro de 2026). Fontes no fim.

## O que cada um faz

| Concorrente | Pontos fortes | O que aproveitamos |
|---|---|---|
| **Prováveis do Cartola** (provaveisdocartola.com.br) | Prováveis escalações por rodada, desfalques separados em lesionados e suspensos, horários e estádios, canal no WhatsApp | **Painel ADM de prováveis que alimenta o modelo** (titular/reserva/dúvida/fora mudam a chance de jogar e todas as projeções na hora), alertas de pendurados e status |
| **Cartomante FC** | Prováveis, indicações de analistas e de IA, capitão, parciais ao vivo, % de escalação por atleta; estratégia "Valorização (Economista)" com preço, média, pontuação esperada, mínimo para valorizar e potencial; dashboard de pontos cedidos por posição e mando | % escalado e **diferenciais**, perfil **Valorização**, **MPV**, **matriz de cedência** com mando e últimos 5 |
| **Gato Mestre (ge.globo)** | Estatística oficial, mínimo para valorizar (PRO), constância, assistente virtual de dicas | MPV oficial quando a API fornece, calibrado quando não; regularidade |
| **CFD Oficial** | Pontos conquistados x cedidos, análise de goleiros por pontos cedidos/conquistados | Cedência para todas as posições e força dos times (xG pró/contra) |
| **Guru do Cartola** | Parciais, valorização ao vivo, sugestões prontas | Ao Vivo com projeção do final da rodada e substituição pelo banco |
| **Cartola FC Brasil / Dicas do Cartola** | Scouts por rodada, histórico de pontuações, times por faixa de cartoletas | Tabela de pontuação no glossário, perfis por objetivo e orçamento |
| **Cartola FC Mix** | "Unanimidades" com preço e mínimo para valorizar | Referência para conferir a ordem de grandeza do MPV calibrado |
| **H2H Scout** | Matriz de cedência por posição, médias casa/fora | Matriz de cedência com shrinkage e cedência por scout |

## Onde o Comandante FC vai além

1. **Projeção scout a scout com Bayes empírico e contexto** (força do adversário enfrentado, mando, xG do confronto, proxy de minutos, preço como prior) em vez de médias e cruzamentos manuais.
2. **Distribuição completa por Monte Carlo** (piso, teto, chance de 12+, de negativar, de valorizar), com correlação entre atletas do mesmo time — inclusive para a tropa inteira.
3. **Otimizador exato** (não heurístico), com capitão dentro da otimização, 7 esquemas, travas, banco e reserva de luxo.
4. **Precisão pública e auditável**: backtest walk-forward contra "escalar pela média", calibração do intervalo e auditoria automática da tabela de pontos.
5. **IA que não inventa números**: o Comandante só responde com o que as ferramentas do motor devolvem.

## Regras do jogo consideradas

- Capitão pontua 1,5× (desde 2023) e o técnico ganha +1 quando o time vence; o técnico pontua pela média dos atletas do clube que entraram em campo.
- Banco: um reserva por setor, com preço igual ou menor que o titular mais barato da posição; **Reserva de Luxo** (2025) substitui o titular que pontuar menos.
- Valorização: `V = CPP × (pontos − MPV)`; desde 2024 atletas caros precisam pontuar mais para valorizar; em 2026 o preço inicial do "bom e barato" passou a variar por posição.

## Fontes

- [Prováveis do Cartola](https://provaveisdocartola.com.br/)
- [Cartomante FC](https://cartomantefc.com.br/) · [Valorização (Economista), rodada 24](https://cartomantefc.com.br/dicas/cartola-2026/rodada/24/valorizacao/) · [Dicas rodada 14](https://delivery.cartomantefc.com.br/cartodados/dicas-e-escalacao-rodada-14-cartola-fc-2026-qual-melhor-capi)
- [CFD Oficial](https://cfdoficial.com/)
- [Guru do Cartola — valorização ao vivo](https://gurudocartola.com/valorizacao-ao-vivo-cartola)
- [Cartola FC Brasil — scouts](https://www.cartolafcbrasil.com.br/scouts)
- [Cartola FC Mix — unanimidades da rodada 29](https://cartolafcmix.com/quadro/unanimidades-rodada-29-cartola-fc-2026/)
- [GOAL — novidades do Cartola 2023](https://www.goal.com/br/listas/as-novidades-e-mudancas-do-cartola-2023/blt295d665f03c98d0f) · [Reserva de Luxo](https://www.goal.com/br/listas/o-que-como-funciona-reserva-de-luxo-novo-recurso-cartola/blt4313cac2920ac4f0) · [Mudanças de 2022](https://www.goal.com/br/not%C3%ADcias/cartola-2022-quais-as-mudancas-do-fantasy-game-para-este-ano/blta9c56ddb72a25560)
- [Dicas do Cartola — valorização (V = CPP × (Pontos − MPV))](https://www.dicascartola.com.br/como-jogar-cartola-fc/como-vai-funcionar-a-valorizacao-no-cartola/) · [Precificação 2026](https://www.dicascartola.com.br/blog-cartoleiros/cartola-2026-precificacao-de-jogadores/)
- [Futebol na Veia — como os técnicos pontuam](https://www.futebolnaveia.com.br/cartola-fc-como-os-tecnicos-fazem-ponto/)
- [SBPO 2024 — otimização + séries temporais para o Cartola](https://proceedings.science/sbpo/sbpo-2024/papers/a-framework-based-on-optimization-and-time-series-for-team-composition-in-cartol?lang=en)
