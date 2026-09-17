/**
 * POST /api/criar-pix — cria a cobrança PIX na ZuckPay.
 *
 * Corpo (do navegador):
 *   { plano: "basico" | "premium", bumps: ["caca-palavras"],
 *     name, email, document, phone, tracking? }
 *
 * O navegador NÃO envia valor: o total é montado no servidor (lib/planos.js).
 *
 * O `hash` devolvido é o external_id_client da cobrança. Ele carrega o plano e
 * os bumps comprados (lib/pedido.js), para o status e o webhook saberem o que
 * entregar sem banco de dados.
 */

const { criarCobranca } = require('../lib/zuckpay');
const { montarPedido } = require('../lib/planos');
const { novoId } = require('../lib/pedido');
const { validarCliente } = require('../lib/validacao');
const { enviarEvento } = require('../lib/meta');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    // 1. Pedido. Preço sempre do servidor.
    const bumps = [...new Set(Array.isArray(body.bumps) ? body.bumps : [])];
    const pedido = montarPedido(body.plano, bumps);
    if (!pedido.ok) {
      // Erro de configuração (preço faltando) é problema nosso, não do
      // comprador: 500, e a mensagem real vai para o log, não para a tela.
      if (/NAO_CONFIGURAD/.test(pedido.codigo)) {
        console.error(`[criar-pix] CONFIGURACAO: ${pedido.erro}`);
        return res.status(500).json({ erro: 'Checkout indisponível no momento.', codigo: pedido.codigo });
      }
      return res.status(400).json({ erro: pedido.erro, codigo: pedido.codigo });
    }

    // 2. Dados do comprador
    const validacao = validarCliente(body);
    if (!validacao.ok) {
      return res.status(422).json({ erro: 'Dados inválidos.', detalhes: validacao.erros });
    }

    // 3. Postback: derivado do host da requisição
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;

    const externalId = novoId(String(body.plano), bumps);
    const cobranca = await criarCobranca({
      externalId,
      valorCentavos: pedido.amount,
      cliente: validacao.customer,
      descricao: pedido.resumo.map(r => r.titulo).join(' + '),
      urlnoty: `${proto}://${host}/api/webhook`,
      tracking: body.tracking || {}
    });

    if (!cobranca.copiaECola) {
      console.error('[criar-pix] resposta da ZuckPay sem o código copia-e-cola (campo "qrcode").');
      return res.status(502).json({
        erro: 'Cobrança criada, mas o código PIX não veio no formato esperado.',
        codigo: 'SCHEMA_PIX_INESPERADO'
      });
    }

    // Evento de intenção, server-side. NÃO é Purchase: a pessoa ainda pode não pagar.
    enviarEvento({
      nome: 'PixGerado',
      transactionHash: externalId,
      valor: pedido.amount,
      contentIds: [String(body.plano), ...bumps],
      cliente: validacao.customer,
      extras: {
        fbp: body.tracking?.fbp,
        fbc: body.tracking?.fbc,
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
        userAgent: req.headers['user-agent']
      },
      urlOrigem: `${proto}://${host}/`
    }).catch(() => { /* rastreamento nunca derruba o checkout */ });

    return res.status(201).json({
      hash: externalId,
      transactionId: cobranca.transactionId,
      copiaECola: cobranca.copiaECola,
      imagemQr: cobranca.imagemQr,
      checkoutUrl: cobranca.checkoutUrl,
      valor: pedido.amount,
      plano: String(body.plano),
      bumps,
      itens: pedido.resumo
    });
  } catch (err) {
    console.error('[criar-pix] falhou:', err.message);

    if (err.codigo === 'CREDENCIAIS_AUSENTES') {
      return res.status(500).json({ erro: 'Checkout indisponível no momento.', codigo: 'CREDENCIAIS_AUSENTES' });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(500).json({ erro: 'Checkout indisponível no momento.', codigo: 'CREDENCIAIS_INVALIDAS' });
    }
    // 400 da ZuckPay = cobrança recusada (ex.: valor abaixo do mínimo da
    // adquirente). A mensagem dela vai para a tela, para o motivo ficar claro.
    if (err.status === 400 || err.status === 422) {
      return res.status(422).json({
        erro: 'A operadora recusou a cobrança.',
        codigo: 'COBRANCA_RECUSADA',
        detalhes: err.body?.message || undefined
      });
    }
    return res.status(500).json({
      erro: 'Não foi possível gerar o PIX agora. Tente novamente.',
      codigo: 'ERRO_ZUCKPAY',
      detalhes: err.body?.message || undefined
    });
  }
};
