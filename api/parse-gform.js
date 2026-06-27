function extractFormId(url) {
  const match = String(url || '').match(/\/forms\/d\/e\/([^/]+)\//) || String(url || '').match(/\/forms\/d\/([^/]+)\//);
  return match ? match[1] : null;
}

function findLoadData(html) {
  const match =
    html.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);\s*<\/script>/s) ||
    html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);/s);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function safeTitle(data) {
  const candidates = [data?.[1]?.[8], data?.[1]?.[0], data?.[1]?.[10]?.[0]]
    .filter(v => typeof v === 'string' && v.trim());
  return candidates[0] || 'SwipeForm';
}

function normalizeQuestion(item) {
  if (!Array.isArray(item)) return null;
  const title = typeof item[1] === 'string' ? item[1].trim() : '';
  const type = item[3];
  const answerBlock = Array.isArray(item[4]) ? item[4][0] : null;
  const entryId = Array.isArray(answerBlock) ? answerBlock[0] : null;
  if (!title || entryId == null) return null;

  let kind = 'scale';
  let max = 5;
  let options = [];
  const rawOptions = Array.isArray(answerBlock?.[1]) ? answerBlock[1] : [];

  // Google Forms common type hint: 0 short answer, 1 paragraph, 2 multiple choice, 3 dropdown, 4 checkbox, 5 linear scale
  if (type === 0 || type === 1) {
    kind = 'text';
  } else if (type === 2 || type === 3) {
    kind = 'choice';
    options = rawOptions.map(o => Array.isArray(o) ? o[0] : o).filter(v => typeof v === 'string' && v.trim());
  } else if (type === 4) {
    kind = 'choice';
    options = rawOptions.map(o => Array.isArray(o) ? o[0] : o).filter(v => typeof v === 'string' && v.trim());
  } else {
    kind = 'scale';
    const numericOptions = rawOptions
      .map(o => Array.isArray(o) ? o[0] : o)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v));
    if (numericOptions.length) max = Math.max(...numericOptions);
    else if (String(title).match(/10|sepuluh/i)) max = 10;
  }

  return { id: String(entryId), title, kind, max: kind === 'scale' ? Math.max(2, Math.min(10, max || 5)) : undefined, options, googleType: type };
}

function parseQuestions(data) {
  const items = data?.[1]?.[1];
  if (!Array.isArray(items)) return [];
  return items.map(normalizeQuestion).filter(Boolean).filter(q => q.kind === 'scale' || q.kind === 'choice' || q.kind === 'text');
}

export default async function handler(req, res) {
  try {
    const url = req.query?.url;
    if (!url || !/^https:\/\/docs\.google\.com\/forms\//.test(url)) {
      return res.status(400).json({ error: 'Masukkan link Google Form publik yang valid.' });
    }

    const formId = extractFormId(url);
    if (!formId) return res.status(400).json({ error: 'ID Google Form tidak terbaca. Pakai link /viewform publik.' });

    const viewUrl = url.includes('/viewform') ? url : url.replace(/\/edit.*$/, '/viewform').replace(/\/$/, '') + '/viewform';
    const response = await fetch(viewUrl, { headers: { 'user-agent': 'Mozilla/5.0 SwipeForm Bot', 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' } });
    const html = await response.text();

    if (!response.ok || /Sign in|Masuk|accounts\.google\.com/i.test(html)) {
      return res.status(422).json({ error: 'Form ini kelihatannya tidak publik atau wajib login Google. Ubah setting form supaya bisa diakses publik dulu.' });
    }

    const data = findLoadData(html);
    if (!data) return res.status(422).json({ error: 'Struktur Google Form tidak terbaca. Coba pakai form sederhana atau link viewform.' });

    const questions = parseQuestions(data);
    if (!questions.length) {
      return res.status(422).json({ error: 'Tidak ada pertanyaan yang berhasil dibaca. MVP ini paling aman untuk skala 1–5/1–10, pilihan ganda, dan jawaban pendek.' });
    }

    return res.status(200).json({ title: safeTitle(data), formId, submitUrl: `https://docs.google.com/forms/d/e/${formId}/formResponse`, sourceUrl: viewUrl, questions });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Gagal membaca Google Form.' });
  }
}
