# Dados reais do Cartola

O Tropa **só mostra dados reais**. Em produção (`NODE_ENV=production`) o padrão é `DATA_MODE=live`: se não houver dado real, a tela avisa em vez de inventar números. A demonstração fica só para desenvolvimento (`npm run dev`).

## Por que o servidor às vezes não consegue

A API (`api.cartolafc.globo.com`) é pública, mas a Globo costuma **barrar IPs de provedores de nuvem** (Vercel, Render, AWS…) e responde 403 ou derruba a conexão. IPs residenciais e os da Cloudflare em geral passam.

**Primeiro passo, sempre:** entre como administrador → **Painel ADM → Dados reais → Testar conexão com a Globo**. O teste mostra, por endereço, o código HTTP e uma leitura em português (403 = bloqueio de IP, sem resposta = rede do provedor, 429 = limite, 5xx = Cartola fora do ar).

Se aparecer "conectou", não há nada a fazer: o site já está com dados reais. Se falhar, use uma das saídas abaixo.

## Saída 1 — Relay gratuito na Cloudflare (recomendada, 100% automática)

O site passa a falar com um Worker seu, e o Worker fala com a Globo.

1. Crie conta grátis em cloudflare.com → **Workers & Pages → Create → Create Worker**.
2. Cole o conteúdo de `deploy/cartola-relay-worker.js` e publique. Você ganha um endereço como `https://cartola-relay.seunome.workers.dev`.
3. (Opcional, recomendado) No Worker, *Settings → Variables* → crie `RELAY_KEY` com uma senha longa.
4. No servidor do site (Render/Vercel), defina:
   - `CARTOLA_API_HOSTS=https://cartola-relay.seunome.workers.dev`
   - `CARTOLA_RELAY_KEY=<a mesma senha>` (se usou o passo 3)
5. Reinicie o site e repita o teste no Painel ADM.

Observação: a Globo também pode barrar a Cloudflare em algumas rotas; o teste do passo 5 diz na hora. Se barrar, vá para a saída 2.

## Saída 2 — Enviar os dados do seu computador (sempre funciona se o seu PC acessa o Cartola)

Seu computador de casa tem IP residencial. Ele baixa a temporada real e envia para o site.

1. No servidor do site defina `IMPORT_KEY=<uma senha longa>` e reinicie.
2. No seu computador (Node 22, dentro da pasta do projeto, depois de `npm install`):

   ```bash
   SITE_URL=https://seu-site.com IMPORT_KEY=<a mesma senha> npm run enviar
   ```

3. O site passa a usar esses dados (selo **Dados reais** no topo). Eles valem por 48 horas.
4. Para manter atualizado, agende o comando: a cada 30 minutos em dias de jogo e uma vez por dia nos demais (Agendador de Tarefas no Windows, `cron` no Linux/Mac, ou o GitHub Actions num repositório seu).

O servidor recusa qualquer arquivo que não venha da API do Cartola (`source=cartola`) e exige a chave.

## Saída 3 — Hospedagem que a Globo aceita

Se preferir não depender de relay nem de envio manual, rode o site num servidor com IP não barrado (por exemplo uma VPS brasileira pequena com o `Dockerfile` do projeto). Cada provedor se comporta de um jeito: o teste do Painel ADM diz se o IP dele passa antes de você migrar.

## Variáveis

| Variável | Uso |
|---|---|
| `DATA_MODE` | `live` (padrão em produção): só dados reais · `auto`: cai para demonstração · `demo` |
| `CARTOLA_API_HOSTS` | Endereços da API, em ordem (use o do relay aqui) |
| `CARTOLA_RELAY_KEY` | Senha enviada ao relay no cabeçalho `x-relay-key` |
| `IMPORT_KEY` | Habilita `POST /api/importar` e é a senha do `npm run enviar` |

## Snapshots

A cada leitura com o mercado aberto o servidor guarda o status de cada atleta em `DATA_DIR/snapshots`. É isso que ensina o modelo de chance de jogar a usar o status do Cartola. Com disco temporário (Vercel) esse histórico se perde; use disco persistente (Render, VPS) para o acerto das prováveis melhorar com o tempo.

## Atualização automática

Um vigia no servidor relê o mercado do Cartola e as notícias **a cada 60 segundos** (`WATCH_INTERVAL_MS`). Se algo mudou (status de um atleta, preço, rodada, mercado abrindo/fechando, notícia de desfalque), ele limpa os caches, guarda o status (snapshot) e avisa todos os navegadores abertos por SSE: as telas se atualizam sozinhas, sem recarregar. As mudanças aparecem em "Últimas mudanças" na página Prováveis.

- Notícias de desfalque (últimas 36 h) só valem se citam o atleta pelo nome **no título** e trazem palavra de ausência (desfalque, lesão, suspenso, cortado, dúvida, poupado…). O efeito é um deslocamento pequeno na chance de jogar, e cada notícia fica visível com o link.
- O vigia precisa de um servidor ligado o tempo todo (Render, VPS). Em funções serverless (Vercel) ele só roda enquanto há visitas.
- `npx tsx scripts/fake-cartola.ts` sobe uma "Globo falsa" para testar isso localmente.

## Conta de administrador

Defina `ADMIN_EMAILS` (o primeiro e-mail vira o admin) e `ADMIN_PASSWORD` (8+ caracteres). A conta é criada e a senha redefinida automaticamente na próxima tentativa de entrar. Para trocar a senha, mude a variável e reinicie. Ninguém consegue cadastrar o e-mail do admin antes de você.

## Escalação oficial perto do jogo (o que mais aumenta o acerto)

Os clubes entregam a súmula cerca de **1 hora antes da bola**. A API do Cartola não traz isso, então o site pode ler da **API-Football** (api-football.com / api-sports.io), que publica as escalações do Brasileirão assim que saem.

1. Crie conta e copie a chave (*API Key*).
2. No servidor, defina `API_FOOTBALL_KEY=<sua chave>` e reinicie. Opcionais: `API_FOOTBALL_LEAGUE` (padrão `71`, Série A) e `LINEUP_POLL_MS` (padrão 5 min).
3. Pronto. De 100 min antes do jogo até 20 min depois, o vigia pergunta de 5 em 5 minutos até a súmula sair. Quando chega, cada atleta vira titular, reserva ou fora, a análise se recalcula e as telas atualizam sozinhas (aparece "Escalação oficial: FLA x CAM" nas mudanças e o ✓ nos atletas).

Cuidados embutidos: só marca "fora" quem não está na súmula se quase todos os nomes foram casados com atletas do Cartola; senão vira "reserva". Nome ambíguo nunca é chutado. Ajustes manuais do Painel ADM vencem a súmula.

**Plano da API-Football:** o plano **gratuito só libera as temporadas 2022–2024** ("Free plans do not have access to this season"), então para a escalação oficial de 2026 é preciso um plano pago. O **Pro (7.500 chamadas/dia, ~US$ 19/mês)** cobre com folga: o site usa menos de 100 por dia. Com o Pro, defina `API_FOOTBALL_DAILY_LIMIT=2000` e `LINEUP_POLL_MS=300000` (consulta a cada 5 min). A assinatura não renova sozinha: ao vencer, volta ao gratuito e o site avisa o erro no Painel ADM.

**Orçamento de chamadas (o site gasta pouco mesmo no plano gratuito de 100 por dia).** O site gasta de ~10 a ~40 por dia:
- a lista de jogos é buscada **uma vez por dia** (hoje e os 2 próximos dias) e fica salva em disco;
- cada jogo só é consultado de **75 min antes até 10 min depois** do início, de 10 em 10 minutos, **no máximo 7 vezes**, e para assim que a súmula chega;
- todos os jogos devidos no mesmo momento vão **numa única chamada** (`/fixtures?ids=a-b-c`), então 5 jogos no mesmo horário custam 1 chamada, não 5;
- um contador diário (salvo em disco, vale mesmo se o site reiniciar) trava em **90** (`API_FOOTBALL_DAILY_LIMIT`), e o site também lê o saldo que a própria API informa e para quando restam 3;
- se a API não devolver as escalações no lote, o site cai sozinho para a chamada por jogo (mais cara, mas ainda dentro do teto).

O Painel ADM → Dados reais mostra quantas chamadas já foram usadas hoje. A API zera o contador à meia-noite UTC (21h em Brasília).

Observação honesta: este módulo foi testado com respostas simuladas no formato da API-Football; ainda não foi testado contra a API real (o ambiente de desenvolvimento não alcança a internet aberta).

## Cruzamento de Scout (Estatísticas → Cruzamento de Scout)

Duas visões:

- **Por time (padrão).** Para cada jogo da rodada, escolhendo scout, posição (ou time inteiro, laterais por lado), recorte (últimos 3, 5, 10 ou todos) e quem analisar (mandantes ou visitantes):
  - **Conquistado** = total do scout feito por essa posição do time analisado nos últimos N jogos dele **no mesmo mando**;
  - **Cedido** = total que o adversário permitiu a essa posição nos últimos N jogos dele **no mando oposto**.

  O SG conta jogos sem sofrer gol. Tocar num jogo mostra de onde sai cada número (jogo a jogo, com os atletas). Em rodada passada aparece o que aconteceu de fato.
- **Por atleta.** Cruza o que cada atleta faz por jogo com o que o adversário cede à posição, scout a scout, separando sempre o **histórico** (o que aconteceu) da **projeção** (o que pode acontecer).

**Dados.** Tudo vem da API pública do Cartola:
- `/atletas/pontuados/{rodada}` traz os scouts de cada atleta que entrou em campo em cada rodada encerrada (conferido: os pontos recalculados batem com os oficiais, então são scouts por jogo, não acumulados);
- `/partidas/{rodada}` traz adversário, mando e placar;
- `/atletas/mercado` e `/mercado/status` trazem atletas e rodada.

A API não publica minutos jogados, então a análise é por partida.

**Banco.** Coleções novas no banco do site (arquivos JSON + Redis, como o resto):
- `scout-rodadas`: uma linha por rodada, com partidas, scouts de cada atleta, impressão digital (hash), revisão e validação dos pontos;
- `scout-atletas`: cadastro de atletas por temporada;
- `scout-temporadas`: clubes de cada temporada;
- `sync-logs`: sincronizações, revisões, verificações e erros.

O cadastro dos scouts (código, nome, categoria, posições, pontos, vigência) fica em código: `src/engine/scoutDefs.ts`.

**Sincronização.**
- **Idempotente:** mesmo conteúdo, nada é gravado; conteúdo mudado vira revisão no log.
- **Rodada congelada:** com todos os jogos encerrados há mais de 5 dias, a rodada passa a ser lida do banco, sem nova chamada à API. Se a API falha numa rodada, usa a versão guardada.
- **Proteção contra resposta parcial:** resposta vazia ou com muito menos atletas nunca sobrescreve a versão guardada.
- **Parciais e jogos futuros** nunca entram no histórico.
- **Painel ADM:** o admin pode testar cada endpoint (campos, tempo, HTTP) e sincronizar na hora.

**Modelo.** Estimativa = taxa do atleta × fator do adversário × fator de mando.
- **Taxa do atleta:** Gama-Poisson com Bayes empírico.
- **Fator do adversário:** encolhido pelo ruído entre os 20 times.
- **Probabilidades:** binomial negativa (Poisson-Gama).
- **SG, gols sofridos e vitória:** modelo de gols de Poisson. O SG ainda multiplica pela parte dos jogos sem gol sofrido em que o atleta de fato recebe o SG.
- **Pontuação:** média e desvio exatos; cenários de 20%/50%/80% vêm de jogos simulados, com gols, assistências, SG e gols sofridos saindo do mesmo placar.
- **Tabela de pontos:** é conferida contra a pontuação oficial da temporada; scout divergente usa o valor que os dados oficiais indicam.

**Conferência.** Para cada rodada passada, o modelo só vê as rodadas anteriores e prevê a chance de cada scout; a tela mostra previsto × real por faixa e por scout. A meia-vida da recência é escolhida por essa conferência.

## Lado dos laterais (LE/LD), descoberto sozinho

O Cartola só diz "lateral". O site descobre o lado lendo a escalação de cada jogo:

- **ESPN** (sem chave, fonte principal): a escalação de cada jogo do Brasileirão traz a posição escrita ("Left Back", "Right Back"). O vigia lê a lista de jogos encerrados a cada 6 h e 4 escalações por minuto; o botão **Painel ADM → Laterais → Atualizar agora** lê todas de uma vez.
- **API-Football** (com `API_FOOTBALL_KEY`, opcional): a escalação traz a posição no desenho tático (`grid`). Usa a temporada mais recente que o plano libera (no gratuito, 2024, Série A e B), 20 jogos por chamada e só com cota sobrando, sem atrapalhar a escalação oficial. Qual ponta é a esquerda é conferido pelos próprios dados: camisa 2 (lateral direito) e 6 (esquerdo).

Na cedência, cada jogo conta o lado em que o lateral jogou **naquele jogo**; o lado do atleta (filtros, ficha, Mercado) é o da maioria dos jogos — ou, para quem se divide, o dos últimos jogos quando eles são de um lado só. A correção manual no Painel ADM vence tudo. O painel mostra, para cada lateral, de onde veio o lado e quantos jogos o sustentam, além de times ou nomes que não casaram com o Cartola.

Variáveis opcionais: `LADOS_AUTO=0` desliga; `LADOS_APIFOOTBALL=0` deixa só a ESPN; `API_FOOTBALL_LADOS_LIGAS` (padrão `71,72`); `ESPN_BASE` e `ESPN_LIGA` (padrão `bra.1`).

Observação honesta: o formato das respostas foi conferido pela documentação e por bibliotecas que usam essas APIs, e os testes usam respostas simuladas nesse formato; daqui não foi possível chamar a ESPN nem a API-Football de verdade. A primeira leitura em produção aparece no Painel ADM → Laterais.

## Fotos dos atletas

O Cartola manda, quando não tem o rosto, uma **silhueta genérica do clube** (endereço com `/silhuetas/`). O site agora ignora essas silhuetas e usa, no lugar, o rosto da API-Football (descobre os 20 times com 1 chamada e lê 1 elenco por minuto, ~21 chamadas uma vez só, sem precisar de temporada paga) ou, por último, o rosto ilustrado.

A foto vem do campo `foto` que a API do Cartola envia para cada atleta. No Painel ADM → Dados reais → "Testar conexão" aparece a seção **Fotos dos atletas**: quantos atletas têm foto, um endereço de exemplo e se o servidor consegue baixar a imagem. O site tenta o CDN direto, depois pelo próprio servidor (`/api/foto`), e só então usa o rosto ilustrado.
