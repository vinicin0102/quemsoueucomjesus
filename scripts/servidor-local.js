/**
 * Servidor de desenvolvimento — `node scripts/servidor-local.js`
 *
 * Serve public/ e roteia /api/<nome> para api/<nome>.js, imitando o que a
 * Vercel faz em produção. É uma conveniência para testar sem a CLI da Vercel;
 * em produção quem serve é a própria Vercel, não este arquivo.
 *
 * Variáveis: leia .env.local antes de subir, por exemplo com
 *   node --env-file=.env.local scripts/servidor-local.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = process.env.DIR_PUBLICO || path.join(RAIZ, 'public');
const PORTA = Number(process.env.PORT || 3000);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

/** Resposta no formato que os handlers da Vercel esperam. */
function adaptarResposta(res) {
  res.status = codigo => { res.statusCode = codigo; return res; };
  res.json = corpo => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(corpo));
    return res;
  };
  return res;
}

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes).toString('utf8');
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  adaptarResposta(res);

  // ---- rotas de API
  if (url.pathname.startsWith('/api/')) {
    const nome = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const arquivo = path.join(RAIZ, 'api', `${nome}.js`);
    if (!fs.existsSync(arquivo)) return res.status(404).json({ erro: 'Rota não encontrada.' });

    req.query = Object.fromEntries(url.searchParams);
    const cru = await lerCorpo(req);
    req.rawBody = cru;
    try { req.body = cru ? JSON.parse(cru) : {}; } catch { req.body = cru; }

    try {
      delete require.cache[require.resolve(arquivo)]; // recarrega a cada request
      await require(arquivo)(req, res);
    } catch (err) {
      console.error(`[api/${nome}]`, err);
      if (!res.writableEnded) res.status(500).json({ erro: 'Erro interno.' });
    }
    return;
  }

  // ---- arquivos estáticos
  let caminho = decodeURIComponent(url.pathname);
  if (caminho.endsWith('/')) caminho += 'index.html';
  const destino = path.join(PUBLICO, caminho);

  // Nunca servir nada fora de public/.
  if (!destino.startsWith(PUBLICO)) { res.statusCode = 403; return res.end('Proibido'); }

  fs.readFile(destino, (erro, dados) => {
    if (erro) { res.statusCode = 404; return res.end('Não encontrado'); }
    res.setHeader('Content-Type', TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream');
    res.end(dados);
  });
});

servidor.listen(PORTA, () => {
  console.log(`Servindo ${PUBLICO} em http://localhost:${PORTA}`);
});
