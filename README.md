# Quem Sou Eu? Com Jesus

Landing page de vendas com checkout PIX integrado à **ZuckPay**, hospedada na
Vercel. Mesma arquitetura da Vet Fácil.

```
public/index.html       página de vendas + modal de checkout (arquivo único)
public/img/             imagens do produto
public/favicon.svg      ícone da marca
api/criar-pix.js        cria a cobrança PIX
api/status.js           consulta o status do pagamento
api/bumps.js            order bumps válidos para o plano
api/webhook.js          recebe o postback da ZuckPay
lib/zuckpay.js          cliente da API v3 da ZuckPay
lib/planos.js           planos, order bumps e PREÇOS (fonte da verdade)
lib/pedido.js           identificador do pedido (external_id_client)
lib/validacao.js        validação dos dados do comprador, no servidor
scripts/servidor-local.js  servidor de desenvolvimento
```

## Configuração

Na Vercel, em **Settings > Environment Variables**, defina:

| Variável | Onde pegar |
|---|---|
| `ZUCKPAY_CLIENT_ID` | Painel ZuckPay > Desenvolvedores > Credenciais API |
| `ZUCKPAY_CLIENT_SECRET` | idem |
| `ZUCKPAY_WEBHOOK_SECRET` | Painel ZuckPay > card *Webhook Secret* (opcional, recomendado) |
| `DIAGNOSTICO_SECRET` | Você inventa. Libera o `/api/diagnostico` (opcional) |
| `META_PIXEL_ID` | Gerenciador de Eventos > Fontes de dados (para rastrear vendas) |
| `META_CAPI_TOKEN` | Gerenciador de Eventos > Configurações > Conversions API |

**Variável nova só vale em deploy novo.** Depois de adicionar ou mudar
qualquer uma delas, rode um *Redeploy* — o deploy que já estava no ar continua
com os valores antigos.

Marque as três para o ambiente **Production**. Variável marcada só como
Preview ou Development não chega no site publicado.

### Quando o PIX não gera

Com `DIAGNOSTICO_SECRET` definido, abra:

```
https://SEU-DOMINIO/api/diagnostico?token=SEU_SEGREDO
```

Ele responde se cada credencial existe, se a ZuckPay as aceita, e se alguma
veio com espaço colado (o erro mais comum ao copiar do painel). Nunca mostra o
valor de nenhuma. Sem a variável definida, o endereço responde 404.

O `webhook_secret` é **diferente** do client secret. Com ele definido, o
`api/webhook.js` recusa qualquer postback sem assinatura válida.

Para rodar local: `cp .env.example .env.local`, preencha e
`node --env-file=.env.local scripts/servidor-local.js` (abre em
http://localhost:3000). Com a CLI da Vercel, `npm run dev` também serve.

## Preços

Tudo em `lib/planos.js`, em **centavos**. É a única fonte da verdade: o
navegador manda só o id do plano e os ids dos extras marcados, nunca o valor.

| Item | Preço |
|---|---|
| Kit Básico (`basico`) | R$ 10,90 |
| Kit Premium (`premium`) | R$ 27,90 |
| Cada material extra (order bump) | R$ 6,90 |

**Os order bumps são os outros cinco materiais**, oferecidos no checkout de quem
escolhe o Básico: jogo da memória, caça-palavras, cruzadinha, complete o
versículo e ligue o personagem à história. Quem escolhe o Premium não vê a
seção — o Premium já traz os cinco, e oferecer de novo seria cobrar duas vezes.

O preço de R$ 6,90 mantém a escada de pé: Básico + 1 extra sai R$ 17,80 e
Básico + 2 sai R$ 24,70, ambos abaixo do Premium, que continua o melhor
negócio para quem quer tudo. Se subir muito o valor do extra, dois deles já
passam o Premium e a oferta perde o sentido.

## Como funciona

1. O visitante clica em um plano e preenche nome, e-mail, CPF e celular.
2. `api/bumps` devolve os extras válidos para aquele plano; o total é recalculado
   na tela a cada extra marcado.
3. `api/criar-pix` monta o pedido — **o total vem de `lib/planos.js`** — e chama
   `POST /v3/pix/qrcode` na ZuckPay.
4. A página mostra o QR Code e o copia-e-cola, e consulta `api/status` até o
   pagamento ser confirmado.
5. A ZuckPay chama `api/webhook`, que **reconsulta** a cobrança na API antes de
   dar qualquer coisa por paga.

O que foi comprado fica codificado no próprio identificador do pedido
(`qsj-<plano>-<extras>-<nonce>`, ver `lib/pedido.js`), então o webhook sabe o
que entregar sem banco de dados.

## Rastreamento (Meta)

Está montado, mas **desligado até você preencher dois lugares com o mesmo
Pixel ID**:

1. `public/index.html`, linha `window.META_PIXEL_ID = '';` — é o pixel do
   navegador. Vazio, nada é carregado e a página funciona igual.
2. As variáveis `META_PIXEL_ID` e `META_CAPI_TOKEN` na Vercel — são a
   Conversions API, que roda no servidor.

**Os dois são necessários, e não é redundância.** Com PIX o comprador sai para
o app do banco e quase nunca volta para a página, então o Purchase do navegador
se perde. Quem registra a venda de verdade é o webhook, server-side, que a
ZuckPay chama quando o pagamento cai.

Os dois lados mandam o mesmo `event_id` (`purchase_<id do pedido>`), então se
os dois chegarem a Meta conta **uma venda só**.

| Evento | Onde dispara |
|---|---|
| `PageView`, `ViewContent` | navegador, ao abrir a página |
| `InitiateCheckout` | navegador, ao abrir o modal |
| `AddToCart` | navegador, ao marcar um material extra |
| `PixGerado` (custom) | **servidor**, quando o QR Code é criado — é intenção, não venda |
| `Purchase` | **servidor** (webhook) + navegador, deduplicados |

Nenhum dado pessoal sai pelo navegador. Nome, e-mail e telefone vão só pela
Conversions API e com hash SHA-256, como a Meta exige. **O CPF nunca é
enviado.**

Para conferir em tempo real, preencha `META_TEST_EVENT_CODE` com o código da
aba *Eventos de teste* do Gerenciador de Eventos.

## Pendências

- **Entrega por e-mail** — `entregarProduto()` no `api/webhook.js` hoje só
  registra no log. É ali que entra o envio do link do PDF, e precisa ser
  idempotente: o mesmo postback pode chegar mais de uma vez.
- **Avaliações** — as quatro conversas do carrossel são reais, mas falam do
  *Passa ou Repassa Bíblico*, não deste jogo. Por isso o título diz "nossos
  materiais". Ao receber mensagens sobre o Quem Sou Eu?, troque as imagens em
  `public/img/avaliacao-0*.png` e ajuste o título da seção.
- **Cronômetro de 15 min** — herdado da Vet Fácil. Se não houver prazo real,
  remova a barra sticky no topo do `<body>`.
- **Ligar o pixel** — o rastreamento está montado mas desligado. Ver
  *Rastreamento (Meta)*, acima: são dois lugares para preencher.
