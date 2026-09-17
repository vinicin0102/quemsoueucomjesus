/**
 * Conversions API da Meta (server-side).
 *
 * Por que existe: o evento Purchase no navegador se perde quando o comprador
 * sai do site para pagar o PIX no app do banco e nao volta. Com PIX isso e a
 * regra, nao a excecao. Este modulo dispara o Purchase a partir do webhook,
 * que a ZuckPay chama quando o pagamento cai — independente do navegador.
 *
 * Deduplicacao: navegador e servidor usam o MESMO event_id, derivado do hash
 * da transacao. Se os dois chegarem, a Meta conta uma vez so.
 *
 * Privacidade: nenhum dado pessoal vai em texto puro. E-mail, telefone e nome
 * sao normalizados e enviados como SHA-256, conforme exigido pela Meta.
 * O CPF nunca e enviado.
 */

const crypto = require('crypto');

const VERSAO_API = 'v21.0';

function sha256(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

/** Normaliza conforme as regras da Meta antes de aplicar o hash. */
const normalizar = {
  email: v => String(v || '').trim().toLowerCase(),
  // Telefone: apenas digitos, com codigo do pais. Brasil = 55.
  telefone: v => {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    return d.startsWith('55') ? d : `55${d}`;
  },
  nome: v => String(v || '').trim().toLowerCase(),
  cidade: v => String(v || '').trim().toLowerCase().replace(/\s/g, ''),
  estado: v => String(v || '').trim().toLowerCase().replace(/\s/g, ''),
  cep: v => String(v || '').replace(/\D/g, '')
};

function hashSeTiver(valor) {
  return valor ? [sha256(valor)] : undefined;
}

/**
 * Monta o bloco user_data. Quanto mais identificadores, melhor a
 * correspondencia — mas todos hasheados.
 */
function montarUserData(cliente = {}, extras = {}) {
  const nomeCompleto = normalizar.nome(cliente.name);
  const partes = nomeCompleto.split(/\s+/).filter(Boolean);

  const dados = {
    em: hashSeTiver(normalizar.email(cliente.email)),
    ph: hashSeTiver(normalizar.telefone(cliente.phone_number || cliente.phone)),
    fn: hashSeTiver(partes[0]),
    ln: hashSeTiver(partes.length > 1 ? partes[partes.length - 1] : ''),
    ct: hashSeTiver(normalizar.cidade(cliente.city)),
    st: hashSeTiver(normalizar.estado(cliente.state)),
    zp: hashSeTiver(normalizar.cep(cliente.zip_code)),
    country: hashSeTiver('br')
  };

  // Nao hasheados: sao identificadores tecnicos, nao dados pessoais.
  if (extras.fbp) dados.fbp = extras.fbp;
  if (extras.fbc) dados.fbc = extras.fbc;
  if (extras.ip) dados.client_ip_address = extras.ip;
  if (extras.userAgent) dados.client_user_agent = extras.userAgent;

  // Remove chaves vazias — a Meta rejeita undefined.
  for (const k of Object.keys(dados)) {
    if (dados[k] === undefined) delete dados[k];
  }
  return dados;
}

/** event_id deterministico: o navegador calcula o mesmo, e a Meta deduplica. */
function idDoEvento(nomeEvento, transactionHash) {
  return `${nomeEvento.toLowerCase()}_${transactionHash}`;
}

/**
 * Envia um evento para a Conversions API.
 * Nunca lanca: falha de rastreamento nao pode derrubar a entrega do produto.
 */
async function enviarEvento({
  nome,
  transactionHash,
  valor,
  moeda = 'BRL',
  contentIds = [],
  cliente,
  extras = {},
  urlOrigem,
  // Momento real do evento, em segundos. Usado no reenvio retroativo:
  // sem isso a Meta atribui a conversao a hora do envio, nao a da venda.
  // A Meta aceita ate 7 dias de atraso.
  eventTime
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!pixelId || !token) {
    console.warn('[meta] META_PIXEL_ID ou META_CAPI_TOKEN ausente; evento nao enviado.');
    return { enviado: false, motivo: 'credenciais ausentes' };
  }

  const evento = {
    event_name: nome,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    event_id: idDoEvento(nome, transactionHash),
    action_source: 'website',
    user_data: montarUserData(cliente, extras)
  };

  if (urlOrigem) evento.event_source_url = urlOrigem;

  if (valor != null) {
    evento.custom_data = {
      value: Number((valor / 100).toFixed(2)),
      currency: moeda,
      content_type: 'product',
      content_ids: contentIds
    };
  }

  const url = new URL(`https://graph.facebook.com/${VERSAO_API}/${pixelId}/events`);
  url.searchParams.set('access_token', token);

  // Codigo de teste opcional: aparece na aba "Eventos de teste".
  const corpo = { data: [evento] };
  if (process.env.META_TEST_EVENT_CODE) {
    corpo.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    });

    const resposta = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error(
        `[meta] ${nome} recusado (${r.status}):`,
        JSON.stringify(resposta?.error?.message || resposta).slice(0, 300)
      );
      return { enviado: false, status: r.status, resposta };
    }

    console.log(
      `[meta] ${nome} enviado. event_id=${evento.event_id} recebidos=${resposta.events_received}`
    );
    return { enviado: true, resposta };
  } catch (err) {
    console.error('[meta] falha de rede:', err.message);
    return { enviado: false, motivo: err.message };
  }
}

module.exports = { enviarEvento, idDoEvento, montarUserData, sha256, normalizar };
