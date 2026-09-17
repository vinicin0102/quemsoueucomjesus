/**
 * GET /api/bumps?plano=basico
 *
 * Order bumps válidos para o plano. Preço, disponibilidade e imagem vêm de
 * lib/planos.js — uma fonte da verdade só. Bump sem preço é omitido, então a
 * página nunca mostra um quebrado.
 */

const { PLANOS, bumpsDoPlano } = require('../lib/planos');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  const plano = String(req.query?.plano || '').trim();
  if (!PLANOS[plano]) return res.status(400).json({ erro: 'Plano inválido.' });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    plano,
    base: PLANOS[plano].amount,
    bumps: bumpsDoPlano(plano)
  });
};
