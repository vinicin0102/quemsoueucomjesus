/**
 * Identificador do pedido — o external_id_client da cobrança na ZuckPay.
 *
 * A consulta de status da ZuckPay não devolve o que foi comprado. Por isso o
 * próprio identificador carrega o plano e os order bumps, e o servidor sabe o
 * que entregar sem precisar de banco de dados:
 *
 *   qsj-<plano>-<bumps>-<nonce>
 *     plano: b = básico, p = premium
 *     bumps: uma letra por bump marcado, ou 0
 *     nonce: 12 hex aleatórios — cada tentativa de compra é uma cobrança nova
 *
 * Não é segredo, e não precisa ser: a ZuckPay só confirma pagamento de um id
 * que ela mesma registrou, e o valor de cada cobrança sai sempre do servidor.
 */

const crypto = require('crypto');

const CODIGO_PLANO = { basico: 'b', premium: 'p', 'premium-oferta': 'o' };
const PLANO_DO_CODIGO = Object.fromEntries(Object.entries(CODIGO_PLANO).map(([k, v]) => [v, k]));

const CODIGO_BUMP = {
  'jogo-da-memoria':    'm',
  'caca-palavras':      'c',
  'cruzadinha':         'z',
  'complete-versiculo': 'v',
  'ligue-personagem':   'l'
};
const BUMP_DO_CODIGO = Object.fromEntries(Object.entries(CODIGO_BUMP).map(([k, v]) => [v, k]));

function novoId(plano, bumps = []) {
  const p = CODIGO_PLANO[String(plano)];
  if (!p) throw new Error('Pedido inválido para gerar identificador.');
  const letras = [...new Set(bumps)].map(b => CODIGO_BUMP[b]).filter(Boolean).join('') || '0';
  return `qsj-${p}-${letras}-${crypto.randomBytes(6).toString('hex')}`;
}

/** Devolve { plano, bumps } ou null se o formato não for nosso. */
function lerId(id) {
  const m = /^qsj-([bpo])-([a-z0]+)-([a-f0-9]{12})$/.exec(String(id || ''));
  if (!m) return null;
  const [, p, letras] = m;
  return {
    plano: PLANO_DO_CODIGO[p],
    bumps: letras === '0' ? [] : [...letras].map(c => BUMP_DO_CODIGO[c]).filter(Boolean)
  };
}

module.exports = { novoId, lerId, CODIGO_BUMP };
