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

**Custo de chamadas:** cada jogo gasta de ~3 a ~10 chamadas por rodada (para de perguntar quando a súmula chega) mais uma lista de jogos a cada 3 h. Num dia com 10 jogos isso passa de 100/dia; o plano gratuito pode ficar curto, e um plano pago resolve. Confira os limites atuais no site do provedor.

Observação honesta: este módulo foi testado com respostas simuladas no formato da API-Football; ainda não foi testado contra a API real (o ambiente de desenvolvimento não alcança a internet aberta).

## Fotos dos atletas

A foto vem do campo `foto` que a API do Cartola envia para cada atleta. No Painel ADM → Dados reais → "Testar conexão" aparece a seção **Fotos dos atletas**: quantos atletas têm foto, um endereço de exemplo e se o servidor consegue baixar a imagem. O site tenta o CDN direto, depois pelo próprio servidor (`/api/foto`), e só então usa o rosto ilustrado.
