import { put, del } from '@vercel/blob';
import { CATS, OPTIONAL, ID_RE, authorize } from '../lib/server.js';

export default async function handler(req, res) {
  try {
    if (!authorize(req, res)) return;

    if (req.method === 'POST') {
      const p = req.body || {};
      const valid = CATS.every(c => (OPTIONAL.includes(c) && (p[c] ?? null) === null) || ID_RE.test(p[c] || ''));
      if (!valid) return res.status(400).json({ error: 'Geçersiz kombin' });
      const pathname = `outfits/${Date.now()}_${p.tshirt}_${p.jacket ?? 'x'}_${p.pants}_${p.shoes}_${p.sweat ?? 'x'}`;
      const blob = await put(pathname, '1', { access: 'public', contentType: 'text/plain', addRandomSuffix: false });
      return res.json({ url: blob.url });
    }

    if (req.method === 'DELETE') {
      const url = req.query.url;
      if (!url || !url.includes('/outfits/')) return res.status(400).json({ error: 'bad url' });
      await del(url);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
