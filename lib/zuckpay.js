/**
 * Cliente da API v3 da ZuckPay.
 *
 * Credenciais (client_id e client_secret) so por variavel de ambiente e so no
 * header Authorization: Basic — nunca na URL, no corpo ou em log.
 *
 * Contrato (conector oficial github.com/ZuckPay/zuckpay-mcp):
 *   POST /v3/pix/qrcode   cria cobranca PIX — valor em REAIS
 *   GET  /v3/pix/status   consulta por transactionId ou external_id_client
 *   Status: PAID, PENDING, WAITING_PAYMENT, FAILED, REFUSED, EXPIRED,
 *           EXPIRADO, REFUNDED, CHARGEBACK
 *   Postback assinado:
 *     X-ZuckPay-Signature: t=<ts>,v1=HMAC-SHA256("<ts>.<corpo cru>", webhook secret)
 */

const crypto = require('crypto');

// O "www" e obrigatorio: sem ele o CDN responde 301 e transforma POST em GET.
const BASE_URL = 'https://www.zuckpay.com.br/conta';
const TIMEOUT_MS = 30000;

function credenciais() {
  const id = process.env.ZUCKPAY_CLIENT_ID;
  const secret = process.env.ZUCKPAY_CLIENT_SECRET;
  if (!id || !secret) {
    const e = new Error('ZUCKPAY_CLIENT_ID/ZUCKPAY_CLIENT_SECRET nao definidos. Configure na hospedagem.');
    e.codigo = 'CREDENCIAIS_AUSENTES';
    throw e;
  }
  return { id, secret };
}

/** Mascara credenciais (e a forma base64 do par) antes de qualquer log. */
function redact(texto) {
  let t = String(texto);
  const { ZUCKPAY_CLIENT_ID: id, ZUCKPAY_CLIENT_SECRET: secret, ZUCKPAY_WEBHOOK_SECRET: wh } = process.env;
  for (const v of [id, secret, wh]) if (v) t = t.split(v).join('***');
  if (id && secret) t = t.split(Buffer.from(`${id}:${secret}`).toString('base64')).join('***');
  return t;
}

async function request(method, path, { query, body } = {}) {
  const { id, secret } = credenciais();
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: 'error'
    });
  } catch (err) {
    const e = new Error(err.name === 'AbortError'
      ? 'A ZuckPay nao respondeu em 30 segundos.'
      : 'Falha de rede ao falar com a ZuckPay.');
    e.status = 502;
    console.error(redact(`[zuckpay] ${method} ${path}: ${err.message}`));
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { _raw: raw }; }

  if (!res.ok) {
    const e = new Error(`ZuckPay ${method} ${path} respondeu ${res.status}`);
    e.status = res.status;
    e.body = data;
    console.error(redact(`[zuckpay] ${method} ${path} -> ${res.status}: ${raw.slice(0, 500)}`));
    throw e;
  }
  return data;
}

const texto = v => (v === undefined || v === null || v === '' ? null : String(v));

/** Dado de comprador que a API devolve mascarado (jo***@) nao serve para nada. */
const semMascara = v => (v && !String(v).includes('*') ? String(v) : null);

/**
 * Cria a cobranca PIX. `valorCentavos` e convertido para reais, como a API exige.
 * `externalId` e a chave de idempotencia e carrega o que foi comprado (lib/pedido.js).
 */
async function criarCobranca({ externalId, valorCentavos, cliente, descricao, urlnoty, tracking = {} }) {
  const body = {
    nome: cliente.name,
    cpf: String(cliente.document).replace(/\D/g, ''),
    email: cliente.email,
    telefone: String(cliente.phone_number).replace(/\D/g, ''),
    valor: Number((valorCentavos / 100).toFixed(2)),
    external_id_client: externalId
  };
  if (descricao) body.descricao = String(descricao).slice(0, 255);
  // A API so aceita postback em https (em ambiente local ele e omitido).
  if (urlnoty && /^https:\/\//.test(urlnoty)) body.urlnoty = urlnoty;
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'fbc', 'fbp']) {
    if (tracking[k]) body[k] = String(tracking[k]).slice(0, 255);
  }

  const r = await request('POST', '/v3/pix/qrcode', { body });
  const d = r?.data ?? r ?? {};
  return {
    transactionId: texto(d.transactionId ?? d.id),
    copiaECola: d.qrcode ?? null,
    imagemQr: d.qrcode_image ?? null,
    checkoutUrl: d.checkout_url ?? null,
    reaproveitada: d.idempotency === true
  };
}

const STATUS = {
  PAID: 'paid', APPROVED: 'paid',
  PENDING: 'pending', WAITING_PAYMENT: 'pending',
  FAILED: 'canceled', REFUSED: 'canceled', EXPIRED: 'canceled', EXPIRADO: 'canceled',
  CANCELED: 'canceled', CANCELLED: 'canceled',
  REFUNDED: 'refunded', CHARGEBACK: 'refunded'
};

function normalizarStatus(s) {
  return STATUS[String(s || '').toUpperCase()] || 'pending';
}

function centavos(v) {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.round(n * 100) : null;
}

/**
 * Consulta a cobranca. Ids do nosso sistema (qsj-...) vao como
 * external_id_client; qualquer outro, como transactionId.
 * Devolve sempre o mesmo formato, com status normalizado e valor em centavos.
 */
async function consultarTransacao(id) {
  const ref = String(id);
  const query = ref.startsWith('qsj-') ? { external_id_client: ref } : { transactionId: ref };
  const r = await request('GET', '/v3/pix/status', { query });
  const d = r?.data ?? r ?? {};
  const c = d.customer ?? d.cliente ?? d.payer ?? {};

  return {
    status: normalizarStatus(d.status),
    statusOriginal: texto(d.status),
    transactionId: texto(d.transactionId ?? d.id),
    external_id_client: texto(d.external_id_client ?? d.externalIdClient) ?? query.external_id_client ?? null,
    amount: centavos(d.amount ?? d.valor),
    paid_at: texto(d.paid_at ?? d.data_pagamento),
    customer: {
      name: semMascara(c.name ?? c.nome ?? d.nome),
      email: semMascara(c.email ?? d.email),
      phone_number: semMascara(c.phone ?? c.telefone ?? d.telefone)
    }
  };
}

/**
 * Valida o postback assinado. Deve receber o corpo CRU, exatamente como
 * chegou — reserializar um JSON ja parseado muda os bytes e invalida o HMAC.
 */
function verificarAssinatura(corpoCru, cabecalho, segredo, toleranciaSeg = 300) {
  const partes = {};
  for (const pedaco of String(cabecalho || '').split(',')) {
    const i = pedaco.indexOf('=');
    if (i > 0) partes[pedaco.slice(0, i).trim()] = pedaco.slice(i + 1).trim();
  }
  const ts = Number(partes.t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranciaSeg) return false;

  const esperado = crypto.createHmac('sha256', segredo).update(`${partes.t}.${corpoCru}`).digest('hex');
  const recebido = String(partes.v1 || '');
  if (!/^[a-f0-9]+$/i.test(recebido) || recebido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recebido, 'hex'), Buffer.from(esperado, 'hex'));
}

module.exports = {
  request,
  criarCobranca,
  consultarTransacao,
  verificarAssinatura,
  normalizarStatus,
  redact,
  semMascara
};
