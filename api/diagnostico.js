/**
 * GET /api/diagnostico?token=<DIAGNOSTICO_SECRET>
 *
 * Responde a uma pergunta só: o checkout está configurado e a ZuckPay aceita
 * as nossas credenciais? Serve para não precisar caçar log quando o PIX falha.
 *
 * NUNCA devolve o valor de uma credencial — só se ela existe e se funciona.
 *
 * Protegido: sem a variável DIAGNOSTICO_SECRET definida na hospedagem, ou com
 * token errado, responde 404. Assim ninguém descobre o estado da configuração
 * do lado de fora.
 */

const { request } = require('../lib/zuckpay');
const { PLANOS, ORDER_BUMPS } = require('../lib/planos');

/** Compara sem vazar o tamanho do segredo pelo tempo de resposta. */
function tokenConfere(recebido, esperado) {
  const crypto = require('crypto');
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(String(esperado));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  const segredo = process.env.DIAGNOSTICO_SECRET;
  if (!segredo || !tokenConfere(req.query?.token, segredo)) {
    return res.status(404).json({ erro: 'Não encontrado.' });
  }

  const env = {
    ZUCKPAY_CLIENT_ID:      Boolean(process.env.ZUCKPAY_CLIENT_ID),
    ZUCKPAY_CLIENT_SECRET:  Boolean(process.env.ZUCKPAY_CLIENT_SECRET),
    ZUCKPAY_WEBHOOK_SECRET: Boolean(process.env.ZUCKPAY_WEBHOOK_SECRET)
  };

  // Espaço em branco no começo ou no fim é o erro mais comum ao colar a
  // credencial no painel, e não aparece na tela de configuração.
  const comEspaco = ['ZUCKPAY_CLIENT_ID', 'ZUCKPAY_CLIENT_SECRET', 'ZUCKPAY_WEBHOOK_SECRET']
    .filter(k => process.env[k] && process.env[k] !== process.env[k].trim());

  const catalogo = {
    planos: Object.fromEntries(Object.entries(PLANOS).map(([id, p]) => [id, p.amount])),
    bumps:  Object.fromEntries(Object.entries(ORDER_BUMPS).map(([id, b]) => [id, b.amount]))
  };

  if (!env.ZUCKPAY_CLIENT_ID || !env.ZUCKPAY_CLIENT_SECRET) {
    return res.status(200).json({
      ok: false,
      motivo: 'CREDENCIAIS_AUSENTES',
      explicacao: 'Defina ZUCKPAY_CLIENT_ID e ZUCKPAY_CLIENT_SECRET em '
                + 'Settings > Environment Variables, marque o ambiente Production '
                + 'e faça um novo deploy: variável nova só entra em deploy novo.',
      env, comEspaco, catalogo
    });
  }

  // Chamada real, com um id que não existe: se as credenciais estiverem certas
  // a ZuckPay responde "não encontrei" (404); se estiverem erradas, 401/403.
  try {
    await request('GET', '/v3/pix/status', { query: { external_id_client: 'diagnostico-inexistente' } });
    return res.status(200).json({ ok: true, motivo: 'CREDENCIAIS_OK', env, comEspaco, catalogo });
  } catch (err) {
    if (err.status === 404 || err.status === 422) {
      return res.status(200).json({
        ok: true,
        motivo: 'CREDENCIAIS_OK',
        detalhe: `A ZuckPay respondeu ${err.status} para uma cobrança que não existe, como esperado.`,
        env, comEspaco, catalogo
      });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(200).json({
        ok: false,
        motivo: 'CREDENCIAIS_INVALIDAS',
        explicacao: 'As variáveis existem, mas a ZuckPay recusou. Confira se o par '
                  + 'client_id/client_secret é o da tela Credenciais API e se não veio '
                  + 'com espaço ou quebra de linha junto.',
        env, comEspaco, catalogo
      });
    }
    return res.status(200).json({
      ok: false,
      motivo: 'FALHA_AO_FALAR_COM_A_ZUCKPAY',
      explicacao: err.message,
      status: err.status || null,
      env, comEspaco, catalogo
    });
  }
};
