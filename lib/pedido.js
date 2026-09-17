/**
 * Identificador do pedido — o external_id_client da cobrança na ZuckPay.
 *
 * A consulta de status da ZuckPay não devolve o que foi comprado. Por isso o
 * próprio identificador carrega o plano, e o servidor sabe o que entregar sem
 * precisar de banco de dados:
 *
 *   qsj-<plano>-<nonce>
 *     plano: basico | premium
 *     nonce: 12 hex aleatórios — cada tentativa de compra é uma cobrança nova
 *
 * Não é segredo, e não precisa ser: a ZuckPay só confirma pagamento de um id
 * que ela mesma registrou, e o valor de cada cobrança sai sempre do servidor.
 */

const crypto = require('crypto');

function novoId(plano) {
  if (!/^[a-z0-9]+$/.test(String(plano))) {
    throw new Error('Pedido inválido para gerar identificador.');
  }
  return `qsj-${plano}-${crypto.randomBytes(6).toString('hex')}`;
}

/** Devolve { plano } ou null se o formato não for nosso. */
function lerId(id) {
  const m = /^qsj-([a-z0-9]+)-([a-f0-9]{12})$/.exec(String(id || ''));
  return m ? { plano: m[1] } : null;
}

module.exports = { novoId, lerId };
