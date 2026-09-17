/**
 * POST /api/webhook — postback da ZuckPay.
 *
 * 1. Com ZUCKPAY_WEBHOOK_SECRET definido, exige assinatura válida
 *    (HMAC sobre o corpo cru, janela de 5 minutos). Sem ele, segue sem.
 * 2. Assinado ou não, NÃO confia no status do corpo: reconsulta a cobrança
 *    na ZuckPay e usa o que a API devolve. O corpo serve só como gatilho.
 * 3. Pago: dispara a entrega do material.
 *
 * É o webhook que garante a entrega: com PIX o comprador paga no app do banco
 * e muitas vezes não volta para a página.
 */

const { consultarTransacao, verificarAssinatura } = require('../lib/zuckpay');
const { lerId } = require('../lib/pedido');

/** Corpo cru, necessário para o HMAC. Nunca reserializar o JSON parseado. */
async function lerCorpoCru(req) {
  if (typeof req.rawBody === 'string') return req.rawBody; // servidor local
  if (!req.readableEnded) {
    const partes = [];
    for await (const p of req) partes.push(p);
    if (partes.length) return Buffer.concat(partes).toString('utf8');
  }
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
}

function idDoCorpo(b) {
  const d = b?.data ?? b ?? {};
  return d.external_id_client ?? d.externalIdClient ?? d.transactionId ?? d.transaction_id ?? d.id ?? null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  const cru = await lerCorpoCru(req);

  const segredo = process.env.ZUCKPAY_WEBHOOK_SECRET;
  if (segredo && !verificarAssinatura(cru, req.headers['x-zuckpay-signature'], segredo)) {
    console.error('[webhook] assinatura inválida ou ausente; postback recusado.');
    return res.status(401).json({ erro: 'Assinatura inválida.' });
  }

  let body;
  try {
    body = cru ? JSON.parse(cru) : {};
  } catch {
    return res.status(400).json({ erro: 'Corpo inválido.' });
  }

  const id = idDoCorpo(body);
  if (!id) return res.status(400).json({ erro: 'Identificador da cobrança ausente.' });

  try {
    const t = await consultarTransacao(String(id));
    const externalId = t.external_id_client || String(id);
    console.log(`[webhook] ${externalId} -> ${t.statusOriginal} (${t.status})`);

    if (t.status === 'paid') {
      await entregarProduto(externalId, lerId(externalId), t);
    }

    // 200 rápido para a ZuckPay parar de reenviar.
    return res.status(200).json({ recebido: true });
  } catch (err) {
    // Cobrança que a ZuckPay não conhece: reenviar não muda nada.
    if (err.status === 404) return res.status(200).json({ recebido: true, ignorado: true });
    console.error('[webhook] falhou:', err.message);
    // 500 sinaliza para a ZuckPay tentar de novo mais tarde.
    return res.status(500).json({ erro: 'Falha ao processar.' });
  }
};

/**
 * PENDENTE: enviar o e-mail com o link do PDF.
 *
 * Precisa ser idempotente — o mesmo postback pode chegar mais de uma vez e o
 * comprador não pode receber o material duas vezes (nem deixar de receber).
 */
async function entregarProduto(externalId, pedido, transacao) {
  console.log('[webhook] pagamento confirmado para', externalId,
              pedido ? `(plano: ${pedido.plano}${pedido.bumps.length ? ' + ' + pedido.bumps.join(', ') : ''})` : '(plano desconhecido)',
              transacao.customer.email ? `e-mail: ${transacao.customer.email}` : '');
}
