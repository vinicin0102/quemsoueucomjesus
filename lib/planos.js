/**
 * Os planos vendidos na página — e, principalmente, o PREÇO.
 *
 * O valor mora aqui, no servidor. O navegador manda só o id do plano
 * ("basico" ou "premium"); um valor vindo do cliente é sempre ignorado.
 * Sem isso, qualquer pessoa editaria a requisição e pagaria R$ 0,01.
 *
 * Valores em CENTAVOS, para não arrastar erro de ponto flutuante.
 */

const PLANOS = {
  basico: {
    titulo: 'Kit Básico — Quem Sou Eu? Com Jesus',
    amount: 1090
  },
  premium: {
    titulo: 'Kit Premium — Quem Sou Eu? Com Jesus',
    amount: 2790
  }
};

/**
 * Monta o pedido a partir do id do plano.
 * Retorna { ok: true, amount, resumo } ou { ok: false, erro, codigo }.
 */
function montarPedido(planoId) {
  const id = String(planoId || '');
  const plano = PLANOS[id];

  if (!plano) {
    return { ok: false, erro: 'Plano inválido.', codigo: 'PLANO_INVALIDO' };
  }
  if (!Number.isInteger(plano.amount) || plano.amount <= 0) {
    return { ok: false, erro: `Preço do plano "${id}" não configurado.`, codigo: 'PRECO_NAO_CONFIGURADO' };
  }

  return {
    ok: true,
    amount: plano.amount,
    resumo: [{ id, titulo: plano.titulo, amount: plano.amount }]
  };
}

module.exports = { PLANOS, montarPedido };
