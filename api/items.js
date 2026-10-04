import { put, list, del } from '@vercel/blob';
import { CATS, authorize, idOf } from '../lib/server.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg' };

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body; // Vercel bazı content-type'larda body'yi kendisi okur
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    if (!authorize(req, res)) return;

    // tek list çağrısı: kıyafetler + kayıtlı kombinler (kombin bilgisi dosya adında: outfits/zaman_tshirt_ceket_pantolon_ayakkabi_kazak)
    if (req.method === 'GET') {
      const { blobs } = await list({ limit: 1000 });
      blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      const items = blobs
        .filter(b => b.pathname.startsWith('wardrobe/'))
        .map(b => ({ id: idOf(b.pathname), url: b.url, cat: b.pathname.split('/')[1] }));
      const outfits = blobs
        .filter(b => b.pathname.startsWith('outfits/'))
        .reverse()
        .map(b => {
          const [, tshirt, jacket, pants, shoes, sweat] = idOf(b.pathname).split('_');
          const opt = v => (!v || v === 'x' ? null : v); // eski kayıtlarda kazak alanı yok
          return { url: b.url, parts: { tshirt, sweat: opt(sweat), jacket: opt(jacket), pants, shoes } };
        });
      return res.json({ items, outfits });
    }

    if (req.method === 'POST') {
      const cat = req.query.cat;
      if (!CATS.includes(cat)) return res.status(400).json({ error: 'bad category' });
      const type = (req.headers['content-type'] || '').split(';')[0];
      const ext = EXT[type];
      if (!ext) return res.status(400).json({ error: 'Sadece PNG veya JPEG kabul edilir' });
      const body = await readBody(req);
      if (!body.length) return res.status(400).json({ error: 'Boş dosya geldi' });
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const blob = await put(`wardrobe/${cat}/${id}.${ext}`, body, {
        access: 'public',
        contentType: type,
        addRandomSuffix: false,
      });
      return res.json({ id, url: blob.url, cat });
    }

    if (req.method === 'DELETE') {
      const url = req.query.url;
      if (!url || !url.includes('/wardrobe/')) return res.status(400).json({ error: 'bad url' });
      await del(url);
      // bu kıyafeti içeren kayıtlı kombinleri de sil
      const id = idOf(new URL(url).pathname);
      const { blobs } = await list({ prefix: 'outfits/' });
      const stale = blobs.filter(b => idOf(b.pathname).split('_').slice(1).includes(id)).map(b => b.url);
      if (stale.length) await del(stale);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
