// api/items.js ve api/outfits.js ortak yardımcılar

export const CATS = ['tshirt', 'jacket', 'pants', 'shoes'];
export const ID_RE = /^[A-Za-z0-9-]+$/;

// 'wardrobe/pants/abc123.jpg' -> 'abc123', 'outfits/1_a_b_c_d' -> '1_a_b_c_d'
export const idOf = pathname => pathname.split('/').pop().replace(/\.[^.]+$/, '');

// şifre + Blob bağlantısı kontrolü; geçmezse cevabı kendisi yazar ve false döner
export function authorize(req, res) {
  const password = (process.env.APP_PASSWORD || '').trim();
  if (!password) {
    res.status(500).json({ error: 'Sunucuda APP_PASSWORD tanımlı değil (Vercel env ekle + redeploy)' });
    return false;
  }
  if (req.headers['x-password'] !== password) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    res.status(500).json({ error: 'Blob projeye bağlı değil (BLOB_STORE_ID yok)' });
    return false;
  }
  return true;
}
