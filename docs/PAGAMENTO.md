# Assinatura paga (Cakto)

A pessoa cria a conta no Tropa, paga no checkout da Cakto com o **mesmo e-mail** e a Cakto avisa o servidor por webhook. O acesso libera sozinho, na hora, sem recarregar a página.

## Configurar (uma vez)

1. **Produto.** Na Cakto, crie o produto de assinatura mensal e copie o link do checkout (`https://pay.cakto.com.br/...`).
2. **Webhook.** Na Cakto, em Integrações → Webhooks, crie um webhook:
   - URL: `https://SEU-DOMINIO/api/cakto` (o Painel ADM → Assinaturas mostra o endereço certo, com botão de copiar);
   - eventos: compra aprovada, assinatura renovada, assinatura cancelada, renovação recusada, reembolso e chargeback;
   - a Cakto mostra a **chave do webhook**: cole no Painel ADM → Assinaturas → "Chave do webhook" e salve. Ela fica só no servidor (o painel nunca mostra de volta). Quem preferir pode usar a variável `CAKTO_WEBHOOK_SECRET` na hospedagem, que tem prioridade.
   Use "Enviar teste" na Cakto: o aviso aparece em Painel ADM → Assinaturas → Avisos da Cakto.
3. **Painel ADM → Assinaturas.** Cole o link do checkout, libere como cortesia quem deve continuar sem pagar e clique em **Ligar cobrança**.

## Como o acesso funciona

| Aviso da Cakto | O que acontece |
|---|---|
| Compra aprovada / renovada | libera até a próxima cobrança + 3 dias (sem a data no aviso: 34 dias) |
| Assinatura cancelada | não renova; o acesso vale até o fim do período pago |
| Renovação recusada | o acesso vale até o fim do período pago e depois vence |
| Reembolso / chargeback | corta o acesso na hora |

- Com a cobrança ligada, só **Início, Guia e Conta** ficam abertos. Admins sempre entram.
- Avisos com segredo errado são recusados (401) e ficam no histórico como "recusado".
- Se você vende outras coisas na Cakto, preencha o **ID do produto** no painel: só ele libera o Tropa.
- Pagou com outro e-mail? Libere o e-mail da conta como cortesia pelo tempo que falta.
