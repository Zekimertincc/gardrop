// Lokal çalıştırma sunucusu (Vercel Blob yerine ./data klasörü). Deploy edilmez, canlıda api/*.js çalışır.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './data';
const PASSWORD = process.env.APP_PASSWORD;
const CATS = ['tshirt', 'jacket', 'pants', 'shoes'];
const ID_RE = /^[A-Za-z0-9-]+$/;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const TYPES = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' };
const MAX_BYTES = 10 * 1024 * 1024;

if (!PASSWORD) { console.error('APP_PASSWORD env değişkeni gerekli'); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });

// dosya adları: <cat>__<id>.jpg (kıyafet), outfit__<zaman>_<t>_<j|x>_<p>_<s>.txt (kombin)
const stripExt = f => f.replace(/\.[^.]+$/, '');
const outfitFields = f => stripExt(f).slice('outfit__'.length).split('_');

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

const allFiles = () => fs.readdirSync(DATA_DIR)
  .map(f => ({ f, t: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
  .sort((a, b) => a.t - b.t)
  .map(x => x.f);

function authorized(req, res) {
  const given = Buffer.from(req.headers['x-password'] || '');
  const want = Buffer.from(PASSWORD);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return true;
  json(res, 401, { error: 'unauthorized' });
  return false;
}

async function items(req, res, url) {
  if (req.method === 'GET') {
    const files = allFiles();
    return json(res, 200, {
      items: files.filter(f => !f.startsWith('outfit__')).map(f => ({ id: stripExt(f.split('__')[1]), url: '/files/' + f, cat: f.split('__')[0] })),
      outfits: files.filter(f => f.startsWith('outfit__')).reverse().map(f => {
        const [, tshirt, jacket, pants, shoes] = outfitFields(f);
        return { url: '/files/' + f, parts: { tshirt, jacket: jacket === 'x' ? null : jacket, pants, shoes } };
      }),
    });
  }
  if (req.method === 'POST') {
    const cat = url.searchParams.get('cat');
    if (!CATS.includes(cat)) return json(res, 400, { error: 'bad category' });
    const ext = EXT[(req.headers['content-type'] || '').split(';')[0]];
    if (!ext) return json(res, 400, { error: 'Sadece PNG veya JPEG kabul edilir' });
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(DATA_DIR, `${cat}__${id}.${ext}`), await readBody(req));
    return json(res, 200, { id, url: `/files/${cat}__${id}.${ext}`, cat });
  }
  if (req.method === 'DELETE') {
    const file = path.basename(url.searchParams.get('url') || '');
    fs.rmSync(path.join(DATA_DIR, file), { force: true });
    const id = stripExt((file.split('__')[1] || ''));
    if (id) for (const f of allFiles()) if (f.startsWith('outfit__') && outfitFields(f).slice(1).includes(id)) fs.rmSync(path.join(DATA_DIR, f));
    return json(res, 200, { ok: true });
  }
  send(res, 405);
}

async function outfits(req, res, url) {
  if (req.method === 'POST') {
    const p = JSON.parse((await readBody(req)).toString() || '{}');
    const valid = CATS.every(c => (c === 'jacket' && p[c] === null) || ID_RE.test(p[c] || ''));
    if (!valid) return json(res, 400, { error: 'Geçersiz kombin' });
    const name = `outfit__${Date.now()}_${p.tshirt}_${p.jacket ?? 'x'}_${p.pants}_${p.shoes}.txt`;
    fs.writeFileSync(path.join(DATA_DIR, name), '1');
    return json(res, 200, { url: '/files/' + name });
  }
  if (req.method === 'DELETE') {
    const file = path.basename(url.searchParams.get('url') || '');
    if (!file.startsWith('outfit__')) return json(res, 400, { error: 'bad url' });
    fs.rmSync(path.join(DATA_DIR, file), { force: true });
    return json(res, 200, { ok: true });
  }
  send(res, 405);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/items' || url.pathname === '/api/outfits') {
      if (!authorized(req, res)) return;
      return await (url.pathname === '/api/items' ? items : outfits)(req, res, url);
    }
    if (url.pathname.startsWith('/files/')) { // img etiketi header gönderemez; dosya adları tahmin edilemez (uuid)
      const f = path.join(DATA_DIR, path.basename(url.pathname));
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), TYPES[path.extname(f).slice(1)] || 'application/octet-stream') : send(res, 404);
    }
    send(res, 200, fs.readFileSync('public/index.html'), 'text/html; charset=utf-8');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log('http://localhost:' + PORT));
