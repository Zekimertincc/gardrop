import { put, list, del } from '@vercel/blob';

const CATS = ['tshirt', 'jacket', 'pants', 'shoes'];

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (!process.env.APP_PASSWORD || req.headers['x-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }

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
    const blob = await put(`wardrobe/${cat}/${Date.now()}.jpg`, body, {
      access: 'public',
      contentType: 'image/jpeg',
    });
    return res.json({ url: blob.url, cat });
  }

  if (req.method === 'DELETE') {
    const url = req.query.url;
    if (!url || !url.includes('/wardrobe/')) return res.status(400).json({ error: 'bad url' });
    await del(url);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
