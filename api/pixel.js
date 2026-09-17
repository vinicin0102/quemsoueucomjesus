/**
 * GET /api/pixel  →  JavaScript que define window.META_PIXEL_ID.
 *
 * Existe para o Pixel ID morar num lugar só: a variável META_PIXEL_ID da
 * hospedagem. Sem isso seria preciso repetir o id dentro do HTML e manter os
 * dois em sincronia na mão — e o dia em que divergissem, o navegador e a
 * Conversions API estariam reportando para pixels diferentes.
 *
 * O Pixel ID NÃO é segredo: ele aparece no código-fonte de qualquer site que
 * usa o pixel. O que é segredo é o META_CAPI_TOKEN, e ele nunca sai daqui.
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  const id = String(process.env.META_PIXEL_ID || '').trim();

  // Só dígitos: um valor estranho na variável não vira código na página.
  const seguro = /^\d{6,20}$/.test(id) ? id : '';

  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  // Cache curto: trocar o pixel na Vercel reflete em minutos, não em dias.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200);
  res.end(`window.META_PIXEL_ID=${JSON.stringify(seguro)};`);
};
