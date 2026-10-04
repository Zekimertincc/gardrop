import { put, list, del } from '@vercel/blob';

const CATS = ['tshirt', 'jacket', 'pants', 'shoes'];

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body; // Vercel bazı content-type'larda body'yi kendisi okur
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    const password = (process.env.APP_PASSWORD || '').trim();
    if (!password) return res.status(500).json({ error: 'Sunucuda APP_PASSWORD tanımlı değil (Vercel env ekle + redeploy)' });
    if (req.headers['x-password'] !== password) return res.status(401).json({ error: 'unauthorized' });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'Blob projeye bağlı değil (BLOB_READ_WRITE_TOKEN yok)' });

    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'wardrobe/', limit: 1000 });
      const items = blobs
        .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
        .map(b => ({ url: b.url, cat: b.pathname.split('/')[1] }));
      return res.json(items);
    }

    if (req.method === 'POST') {
      const cat = req.query.cat;
      if (!CATS.includes(cat)) return res.status(400).json({ error: 'bad category' });
      const body = await readBody(req);
      if (!body.length) return res.status(400).json({ error: 'Boş dosya geldi' });
      const blob = await put(`wardrobe/${cat}/${Date.now()}.jpg`, body, {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: true,
      });
      return res.json({ url: blob.url, cat });
    }

    if (req.method === 'DELETE') {
      const url = req.query.url;
      if (!url || !url.includes('/wardrobe/')) return res.status(400).json({ error: 'bad url' });
      await del(url);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
