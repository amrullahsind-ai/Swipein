// ── Utilities ─────────────────────────────────────────────────────────────────

function extractFormId(url) {
  const match =
    String(url || '').match(/\/forms\/d\/e\/([^/]+)\//) ||
    String(url || '').match(/\/forms\/d\/([^/]+)\//);
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

// ── Likert scale auto-detection ───────────────────────────────────────────────
//
// Multiple-choice questions that follow a Likert pattern (e.g. "Sangat Setuju"
// through "Sangat Tidak Setuju") are detected here and converted to swipeable
// scale cards instead of click-based radio lists.

const LIKERT_POSITIVE = [
  /^sangat\s+(?!tidak)/i,   // "Sangat Sesuai", "Sangat Setuju", "Sangat Puas"...
  /^strongly\s+(?!dis)/i,   // "Strongly agree"
  /^selalu$/i,              // "Selalu" (Always)
  /^always$/i,
];

const LIKERT_NEGATIVE = [
  /sangat\s+tidak/i,        // "Sangat Tidak Sesuai"
  /strongly\s+dis/i,        // "Strongly disagree"
  /tidak\s+pernah/i,        // "Tidak Pernah"
  /never/i,
];

/**
 * Returns { ascending: boolean } if options look like a Likert scale, else null.
 * ascending = true  → value 1 = options[0] (low positive)
 * ascending = false → value 1 = options[last] (high negative), value max = options[0]
 */
function detectLikertScale(opts) {
  if (!opts?.length || opts.length < 3 || opts.length > 7) return null;

  // Pure numeric options ("1","2","3") only if range ≤ 10 starting from 1
  const nums = opts.map(o => Number(o.trim())).filter(n => Number.isFinite(n) && n > 0);
  if (nums.length === opts.length) {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted[0] === 1 && sorted[sorted.length - 1] <= 10) {
      return { ascending: true };
    }
    return null; // numbers like 16,17,18... stay as regular choice
  }

  const firstOpt = opts[0].trim();
  const lastOpt  = opts[opts.length - 1].trim();

  const firstIsPositive = LIKERT_POSITIVE.some(p => p.test(firstOpt));
  const lastIsNegative  = LIKERT_NEGATIVE.some(p => p.test(lastOpt));
  const firstIsNegative = LIKERT_NEGATIVE.some(p => p.test(firstOpt));
  const lastIsPositive  = LIKERT_POSITIVE.some(p => p.test(lastOpt));

  // "Sangat Setuju" → ... → "Sangat Tidak Setuju" (descending: first=highest)
  if (firstIsPositive && lastIsNegative) return { ascending: false };
  // "Sangat Tidak Setuju" → ... → "Sangat Setuju" (ascending: first=lowest)
  if (firstIsNegative && lastIsPositive) return { ascending: true };

  // Fallback: any option contains "sangat" + at least one contains "tidak"
  const allText = opts.join(' ').toLowerCase();
  const hasSangat = /sangat/.test(allText);
  const hasTidak  = /tidak|never|dis/.test(allText);
  if (hasSangat && hasTidak) {
    return { ascending: !firstIsPositive };
  }

  // Frequency scale: Selalu / Sering / Kadang-kadang / Jarang / Tidak Pernah
  const freqWords = /selalu|sering|kadang|jarang|tidak pernah|always|often|sometimes|rarely|never/i;
  const freqMatches = opts.filter(o => freqWords.test(o));
  if (freqMatches.length >= Math.ceil(opts.length * 0.6)) {
    const firstIsAlways = /selalu|always/i.test(firstOpt);
    return { ascending: !firstIsAlways }; // "Selalu" = highest positive
  }

  return null;
}

// ── Question normalizer ────────────────────────────────────────────────────────

function normalizeQuestion(item) {
  if (!Array.isArray(item)) return null;

  const title = typeof item[1] === 'string' ? item[1].trim() : '';
  const type = item[3];
  const answerBlock = Array.isArray(item[4]) ? item[4][0] : null;
  const entryId = Array.isArray(answerBlock) ? answerBlock[0] : null;
  if (!title || entryId == null) return null;

  // Required: typically item[4][0][2] === 1 or item[7] === 1
  const required = answerBlock?.[2] === 1 || item[7] === 1 || false;

  let kind = 'scale';
  let max = 5;
  let options = [];
  let scaleLabels = null;
  const rawOptions = Array.isArray(answerBlock?.[1]) ? answerBlock[1] : [];

  /*
   * Google Forms question types:
   *   0 = Short answer
   *   1 = Paragraph (long answer)
   *   2 = Multiple choice (radio)
   *   3 = Dropdown
   *   4 = Checkbox (multi-select) ← was incorrectly treated as radio before
   *   5 = Linear scale
   */
  if (type === 0 || type === 1) {
    kind = 'text';

  } else if (type === 2 || type === 3) {
    const rawOpts = rawOptions
      .map(o => Array.isArray(o) ? o[0] : o)
      .filter(v => typeof v === 'string' && v.trim());

    const likert = detectLikertScale(rawOpts);
    if (likert) {
      // Convert Likert multiple-choice → swipeable scale
      kind = 'scale';
      max  = rawOpts.length;
      scaleLabels = {};
      rawOpts.forEach((opt, i) => {
        // ascending=false → first option maps to highest value (e.g. "Sangat Setuju" = 5)
        const val = likert.ascending ? i + 1 : max - i;
        scaleLabels[val] = opt;
      });
    } else {
      kind    = 'choice';
      options = rawOpts;
    }

  } else if (type === 4) {
    // BUG FIX: Checkbox must be its own kind — not the same as radio 'choice'
    kind = 'checkbox';
    options = rawOptions
      .map(o => Array.isArray(o) ? o[0] : o)
      .filter(v => typeof v === 'string' && v.trim());

  } else {
    // Linear scale (type === 5) or unknown → treat as scale
    kind = 'scale';
    const numericOptions = rawOptions
      .map(o => Array.isArray(o) ? o[0] : o)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v));

    if (numericOptions.length) {
      max = Math.max(...numericOptions);
    } else if (String(title).match(/10|sepuluh/i)) {
      max = 10;
    }

    // Try to read custom low/high labels from form data
    try {
      const lowLabel = answerBlock?.[3]?.[0];
      const highLabel = answerBlock?.[3]?.[1];
      if (lowLabel || highLabel) {
        scaleLabels = {};
        if (lowLabel) scaleLabels[1] = String(lowLabel);
        if (highLabel) scaleLabels[max] = String(highLabel);
      }
    } catch (_) { /* ignore — best effort */ }
  }

  return {
    id: String(entryId),
    title,
    kind,
    max: kind === 'scale' ? Math.max(2, Math.min(10, max || 5)) : undefined,
    options: (kind === 'choice' || kind === 'checkbox') ? options : undefined,
    scaleLabels: scaleLabels || undefined,
    required,
    googleType: type,
  };
}

function parseQuestions(data) {
  const items = data?.[1]?.[1];
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeQuestion)
    .filter(Boolean)
    .filter(q => ['scale', 'choice', 'checkbox', 'text'].includes(q.kind));
}

// ── URL validation — accept docs.google.com AND forms.gle ─────────────────────

function isValidGFormUrl(url) {
  return (
    /^https:\/\/docs\.google\.com\/forms\//.test(url) ||
    /^https:\/\/forms\.gle\//.test(url)
  );
}

// ── Serverless handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    const url = req.query?.url;

    if (!url || !isValidGFormUrl(url)) {
      return res.status(400).json({
        error: 'Masukkan link Google Form publik yang valid. Contoh: https://docs.google.com/forms/d/e/.../viewform atau https://forms.gle/...',
      });
    }

    // Build viewform URL
    const viewUrl = url.includes('/viewform')
      ? url
      : url.replace(/\/edit.*$/, '/viewform').replace(/\/$/, '') + '/viewform';

    const response = await fetch(viewUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SwipeForm Bot/1.0)',
        'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    const html = await response.text();

    // Only check if truly redirected to login page.
    // NOTE: We do NOT scan html for "Sign in" — that text appears on ALL Google
    // pages (in the navbar) and would cause false positives on public forms.
    const redirectedToLogin = response.url.includes('accounts.google.com');
    if (!response.ok || redirectedToLogin) {
      return res.status(422).json({
        error: 'Form ini tidak publik atau wajib login Google. Buka Google Form → Settings → ubah akses ke "Anyone with the link".',
      });
    }

    const data = findLoadData(html);
    if (!data) {
      return res.status(422).json({
        error: 'Struktur Google Form tidak terbaca. Pastikan menggunakan link /viewform dari form sederhana.',
      });
    }

    const questions = parseQuestions(data);
    if (!questions.length) {
      return res.status(422).json({
        error: 'Tidak ada pertanyaan yang berhasil dibaca. MVP ini mendukung: skala 1–5/1–10, pilihan ganda, checkbox, dan jawaban pendek.',
      });
    }

    // Try to get formId from original URL or from the resolved URL after redirect
    const formId = extractFormId(url) || extractFormId(response.url);
    if (!formId) {
      return res.status(422).json({
        error: 'Tidak bisa mengekstrak Form ID. Pastikan menggunakan link /viewform langsung.',
      });
    }

    return res.status(200).json({
      title: safeTitle(data),
      formId,
      submitUrl: `https://docs.google.com/forms/d/e/${formId}/formResponse`,
      sourceUrl: viewUrl,
      questions,
    });

  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Gagal membaca Google Form. Coba lagi atau periksa link yang dimasukkan.',
    });
  }
}
