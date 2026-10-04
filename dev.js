// Lokal çalıştırma sunucusu (Vercel Blob yerine ./data klasörü). Deploy edilmez, canlıda api/items.js çalışır.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './data';
const PASSWORD = process.env.APP_PASSWORD;
const CATS = ['tshirt', 'jacket', 'pants', 'shoes'];
const MAX_BYTES = 10 * 1024 * 1024;

if (!PASSWORD) { console.error('APP_PASSWORD env değişkeni gerekli'); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });

const send = (res, code, body = '', type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw new Error('too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function api(req, res, url) {
  const given = Buffer.from(req.headers['x-password'] || '');
  const want = Buffer.from(PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return json(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET') {
    const list = fs.readdirSync(DATA_DIR)
      .map(f => ({ f, t: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
      .sort((a, b) => a.t - b.t)
      .map(({ f }) => ({ url: '/files/' + f, cat: f.split('__')[0] }));
    return json(res, 200, list);
  }
  if (req.method === 'POST') {
    const cat = url.searchParams.get('cat');
    if (!CATS.includes(cat)) return json(res, 400, { error: 'bad category' });
    const name = `${cat}__${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(DATA_DIR, name), await readBody(req));
    return json(res, 200, { url: '/files/' + name, cat });
  }
  if (req.method === 'DELETE') {
    fs.rmSync(path.join(DATA_DIR, path.basename(url.searchParams.get('url') || '')), { force: true });
    return json(res, 200, { ok: true });
  }
  send(res, 405);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/items') return await api(req, res, url);
    if (url.pathname.startsWith('/files/')) { // img etiketi header gönderemez; dosya adları tahmin edilemez (uuid)
      const f = path.join(DATA_DIR, path.basename(url.pathname));
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), 'image/jpeg') : send(res, 404);
    }
    send(res, 200, fs.readFileSync('public/index.html'), 'text/html; charset=utf-8');
  } catch (e) {
    send(res, 500, JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT));
