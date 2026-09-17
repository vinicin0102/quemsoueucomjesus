/**
 * GET /api/status?hash=<id do pedido>
 *
 * Consultado pelo navegador enquanto espera o PIX cair. O status vem sempre
 * da ZuckPay, nunca do que o navegador afirma.
 */

const { consultarTransacao } = require('../lib/zuckpay');
const { lerId } = require('../lib/pedido');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  const hash = String(req.query?.hash || '').trim();
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(hash)) {
    return res.status(400).json({ erro: 'Identificador inválido.' });
  }

  try {
    const t = await consultarTransacao(hash);
    const pago = t.status === 'paid';
    const pedido = lerId(t.external_id_client || hash);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      status: t.status,
      pago,
      finalizado: ['paid', 'canceled', 'refunded'].includes(t.status),
      plano: pedido ? pedido.plano : null,
      bumps: pedido ? pedido.bumps : []
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ erro: 'Cobrança não encontrada.' });
    console.error('[status] falhou:', err.message);
    return res.status(500).json({ erro: 'Não foi possível consultar o status.' });
  }
};
