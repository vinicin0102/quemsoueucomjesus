/**
 * Catálogo — FONTE DA VERDADE DE PREÇO.
 *
 * O valor mora aqui, no servidor. O navegador manda só o id do plano e os ids
 * dos order bumps marcados; um valor vindo do cliente é sempre ignorado. Sem
 * isso, qualquer pessoa editaria a requisição e pagaria R$ 0,01.
 *
 * Valores em CENTAVOS, para não arrastar erro de ponto flutuante.
 */

/* ------------------------------------------------------------------ PLANOS */

const PLANOS = {
  basico: {
    titulo: 'Kit Básico — Quem Sou Eu? Personagens Bíblicos',
    amount: 1090
  },
  premium: {
    titulo: 'Kit Premium — Quem Sou Eu? + 5 materiais extras',
    amount: 2790
  },

  /**
   * Oferta que aparece no pop-up de quem clicou no Básico: o Premium pela
   * metade. É um plano de verdade, com id próprio, porque o preço tem que
   * sair do servidor como qualquer outro — e porque assim dá para separar
   * nos relatórios quantas vendas vieram do pop-up.
   *
   * Não existe botão para ele fora do pop-up, mas isso é só a página: quem
   * chamar a API com este id paga este valor. É de propósito.
   */
  'premium-oferta': {
    titulo: 'Kit Premium (oferta) — Quem Sou Eu? + 5 materiais extras',
    amount: 1395
  }
};

/* ------------------------------------------------------------- ORDER BUMPS
 *
 * São os outros materiais, oferecidos na hora do checkout. Cada um marcado
 * soma o seu `amount` ao total da cobrança.
 *
 * Só aparecem para quem escolhe o BÁSICO: o Kit Premium já traz todos, e
 * oferecer de novo seria cobrar duas vezes pelo mesmo arquivo.
 */

const PLANOS_COM_BUMP = ['basico'];

/**
 * Bumps do pop-up (plano "premium-oferta").
 *
 * Tem que ser uma lista SEPARADA: o completo já traz os cinco materiais, e
 * oferecer qualquer um deles de novo seria cobrar duas vezes pelo mesmo PDF.
 * Aqui entram só produtos que NÃO estão dentro do completo.
 *
 * Cada item precisa de: titulo, descricao, amount (em centavos) e icone
 * (arquivo em public/img/). Bump com amount 0 não aparece na tela — é assim
 * que um item fica cadastrado mas desligado até a arte e o preço existirem.
 */
const PLANOS_COM_BUMP_OFERTA = ['premium-oferta'];

const ORDER_BUMPS = {
  'jogo-da-memoria': {
    titulo: 'Jogo da Memória Bíblico',
    descricao: 'Pares de personagens para achar e conversar sobre a história.',
    amount: 690,
    icone: 'img/bump-jogo-da-memoria.jpg',
    planos: PLANOS_COM_BUMP
  },
  'caca-palavras': {
    titulo: 'Caça-Palavras Bíblico',
    descricao: 'Folhas prontas para imprimir e distribuir para a turma.',
    amount: 690,
    icone: 'img/bump-caca-palavras.jpg',
    planos: PLANOS_COM_BUMP
  },
  'cruzadinha': {
    titulo: 'Cruzadinha Bíblica',
    descricao: 'Para fixar nomes e histórias no fim da aula.',
    amount: 690,
    icone: 'img/bump-cruzadinha.jpg',
    planos: PLANOS_COM_BUMP
  },
  'complete-versiculo': {
    titulo: 'Complete o Versículo',
    descricao: 'Atividade de memorização, do jeito que a criança entende.',
    amount: 690,
    icone: 'img/bump-complete-versiculo.jpg',
    planos: PLANOS_COM_BUMP
  },
  'ligue-personagem': {
    titulo: 'Ligue o Personagem à História',
    descricao: 'Liga cada personagem à passagem em que ele aparece.',
    amount: 690,
    icone: 'img/bump-ligue-personagem.jpg',
    planos: PLANOS_COM_BUMP
  }
};

/* ------------------------------------------------------------------ PEDIDO */

/**
 * Monta o pedido a partir do plano e dos bumps marcados.
 * Retorna { ok: true, amount, resumo } ou { ok: false, erro, codigo }.
 */
function montarPedido(planoId, bumpIds = []) {
  const id = String(planoId || '');
  const plano = PLANOS[id];

  if (!plano) {
    return { ok: false, erro: 'Plano inválido.', codigo: 'PLANO_INVALIDO' };
  }
  if (!Number.isInteger(plano.amount) || plano.amount <= 0) {
    return { ok: false, erro: `Preço do plano "${id}" não configurado.`, codigo: 'PRECO_NAO_CONFIGURADO' };
  }

  let amount = plano.amount;
  const resumo = [{ id, titulo: plano.titulo, amount: plano.amount }];

  for (const bumpId of [...new Set(Array.isArray(bumpIds) ? bumpIds : [])]) {
    const bump = ORDER_BUMPS[bumpId];
    if (!bump) {
      return { ok: false, erro: `Order bump "${bumpId}" não existe.`, codigo: 'BUMP_INVALIDO' };
    }
    if (!bump.planos.includes(id)) {
      return {
        ok: false,
        erro: `Order bump "${bumpId}" não é válido para o plano "${id}".`,
        codigo: 'BUMP_INVALIDO'
      };
    }
    if (!Number.isInteger(bump.amount) || bump.amount <= 0) {
      return { ok: false, erro: `Order bump "${bumpId}" sem preço.`, codigo: 'PRECO_NAO_CONFIGURADO' };
    }
    amount += bump.amount;
    resumo.push({ id: bumpId, titulo: bump.titulo, amount: bump.amount });
  }

  return { ok: true, amount, resumo };
}

/** Os bumps disponíveis para um plano, no formato que a página consome. */
function bumpsDoPlano(planoId) {
  return Object.entries(ORDER_BUMPS)
    .filter(([, b]) => b.planos.includes(String(planoId)) && b.amount > 0)
    .map(([id, b]) => ({
      id,
      titulo: b.titulo,
      descricao: b.descricao,
      amount: b.amount,
      icone: b.icone || null
    }));
}

module.exports = { PLANOS, ORDER_BUMPS, montarPedido, bumpsDoPlano };
