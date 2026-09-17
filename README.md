# Quem Sou Eu? Com Jesus

Landing page de vendas com checkout PIX integrado à **ZuckPay**, hospedada na
Vercel. Mesma arquitetura da Vet Fácil.

```
public/index.html     página de vendas + modal de checkout (arquivo único)
public/img/           imagens do produto (ver public/img/LEIA-ME.md)
api/criar-pix.js      cria a cobrança PIX
api/status.js         consulta o status do pagamento
api/webhook.js        recebe o postback da ZuckPay
lib/zuckpay.js        cliente da API v3 da ZuckPay
lib/planos.js         os planos e os PREÇOS (fonte da verdade)
lib/pedido.js         identificador do pedido (external_id_client)
lib/validacao.js      validação dos dados do comprador, no servidor
```

## Configuração

Na Vercel, em **Settings > Environment Variables**, defina:

| Variável | Onde pegar |
|---|---|
| `ZUCKPAY_CLIENT_ID` | Painel ZuckPay > Desenvolvedores > Credenciais API |
| `ZUCKPAY_CLIENT_SECRET` | idem |
| `ZUCKPAY_WEBHOOK_SECRET` | Painel ZuckPay > card *Webhook Secret* (opcional, recomendado) |

O `webhook_secret` é **diferente** do client secret. Com ele definido, o
`api/webhook.js` recusa qualquer postback sem assinatura válida.

Para rodar local: `cp .env.example .env.local`, preencha e `npm run dev`
(precisa da CLI da Vercel).

## Como funciona

1. O visitante clica em um plano e preenche nome, e-mail, CPF e celular.
2. `api/criar-pix` monta o pedido — **o preço vem de `lib/planos.js`, nunca do
   navegador** — e chama `POST /v3/pix/qrcode` na ZuckPay.
3. A página mostra o QR Code e o copia-e-cola, e consulta `api/status` até o
   pagamento ser confirmado.
4. A ZuckPay chama `api/webhook`, que **reconsulta** a cobrança na API antes de
   dar qualquer coisa por paga.

Planos: **Kit Básico R$ 10,90** (`basico`) e **Kit Premium R$ 27,90**
(`premium`). Para mudar preço, mexa em `lib/planos.js` (valor em centavos) e no
rótulo dentro do `public/index.html`.

## Pendências

- **Imagens do produto** — são 10 arquivos, listados em `public/img/LEIA-ME.md`.
  Enquanto não existirem, o lugar mostra um quadro tracejado com o nome
  esperado. Assim que o arquivo subir com aquele nome, a imagem aparece sozinha.
- **Entrega por e-mail** — `entregarProduto()` no `api/webhook.js` hoje só
  registra no log. É ali que entra o envio do link do PDF, e precisa ser
  idempotente: o mesmo postback pode chegar mais de uma vez.
- **Depoimentos** — os seis são ilustrativos e atribuídos a funções
  ("Professora de EBD"), não a pessoas inventadas. Ao ter mensagens reais,
  troque o texto, ponha o nome e remova o aviso `#aviso-depoimentos`.
- **Cronômetro de 15 min** — herdado da Vet Fácil. Se não houver prazo real,
  remova a barra sticky no topo do `<body>`.
- **Meta Pixel** — a página não tem pixel. Se for anunciar, vale portar o
  `lib/meta.js` da Vet Fácil para disparar o Purchase pelo webhook (com PIX o
  comprador costuma não voltar para a aba).
