// Servidor opcional, sem dependências (Node 18+):
//   node servidor.mjs          → http://localhost:8080
// Serve o site e repassa /tse/* para resultados.tse.jus.br e /ibge/* para servicodados.ibge.gov.br,
// para quando o navegador não conseguir acessar esses endereços diretamente (CORS).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTA = Number(process.env.PORT) || 8080;
const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const DESTINOS = { tse: 'https://resultados.tse.jus.br', ibge: 'https://servicodados.ibge.gov.br' };
const CACHE_MS = { tse: 15_000, ibge: 24 * 3600_000 };
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
};

// Cache curto em memória: vários visitantes não multiplicam as requisições ao TSE.
const cache = new Map();

async function repassar(alvo, caminho, res) {
  const url = DESTINOS[alvo] + caminho;
  const agora = Date.now();
  const guardado = cache.get(url);
  if (guardado && agora - guardado.em < CACHE_MS[alvo]) return enviar(res, guardado);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'apuracao-2026 (proxy local)' } });
    const corpo = Buffer.from(await r.arrayBuffer());
    const item = { status: r.status, tipo: r.headers.get('content-type') || 'application/octet-stream', corpo, em: agora };
    if (r.ok) {
      cache.set(url, item);
      if (cache.size > 5000) cache.delete(cache.keys().next().value);
    }
    enviar(res, item);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end('Falha ao acessar ' + url);
  }
}

function enviar(res, { status, tipo, corpo }) {
  res.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-cache' }).end(corpo);
}

createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');
  if (pathname === '/proxy-ok') {
    return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  }
  const m = pathname.match(/^\/(tse|ibge)(\/.*)$/);
  if (m) {
    if (m[1] === 'tse' && !m[2].startsWith('/oficial/')) return res.writeHead(403).end();
    if (m[1] === 'ibge' && !m[2].startsWith('/api/v3/malhas/')) return res.writeHead(403).end();
    return repassar(m[1], m[2] + search, res);
  }
  const arquivo = normalize(join(RAIZ, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  if (!arquivo.startsWith(RAIZ.endsWith(sep) ? RAIZ : RAIZ + sep) || arquivo.endsWith('.mjs')) return res.writeHead(403).end();
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] || 'application/octet-stream' }).end(corpo);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
}).listen(PORTA, () => console.log(`Apuração 2026 em http://localhost:${PORTA}`));
