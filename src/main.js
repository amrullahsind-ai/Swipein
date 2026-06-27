import './style.css';

const app = document.querySelector('#app');

// ══════════════════════════════════════════════════════════════════
//  AUDIO — Web Audio API (no dependencies)
// ══════════════════════════════════════════════════════════════════

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq = 520, duration = 0.12, type = 'sine', volume = 0.15) {
  try {
    const ctx = getAudioCtx();
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.01);
  } catch (_) { /* silent fail — audio not critical */ }
}

/** Bell "cling!" when finishing a question — fundamental + harmonics with long decay */
function playSoundNext() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    // Bell harmonics: fundamental C6 (1047 Hz) + overtones
    // Each partial decays at different rate, giving a rich bell timbre
    const partials = [
      { freq: 1046.5, gain: 0.28, decay: 0.70 },  // fundamental
      { freq: 2093.0, gain: 0.14, decay: 0.50 },  // 2nd harmonic
      { freq: 3136.0, gain: 0.07, decay: 0.35 },  // 3rd harmonic
      { freq: 4186.0, gain: 0.04, decay: 0.22 },  // 4th harmonic
    ];

    partials.forEach(({ freq, gain, decay }) => {
      const osc  = ctx.createOscillator();
      const gn   = ctx.createGain();
      osc.connect(gn);
      gn.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gn.gain.setValueAtTime(gain, ctx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + decay + 0.02);
    });
  } catch (_) { /* silent fail */ }
}

/** Celebratory ascending chord on final submit */
function playSoundDone() {
  [440, 554, 659, 880].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.20, 'sine', 0.13), i * 75)
  );
}

/** Pitch varies with scale value — gives tactile feel while dragging */
function playSoundSwipe(value, max) {
  const freq = 260 + (value / max) * 440;
  playTone(freq, 0.07, 'sine', 0.10);
}

// ══════════════════════════════════════════════════════════════════
//  ENCODING — base64url (no server needed for config in URL)
// ══════════════════════════════════════════════════════════════════

function encodeConfig(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeConfig(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array([...binary].map(ch => ch.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Parse URL hash to get play or edit param */
function getHashParams() {
  const hash = new URLSearchParams(location.hash.slice(1));
  return { play: hash.get('play'), edit: hash.get('edit') };
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', ' ');
}

/** Get display label for a scale value */
const defaultLabels = {
  low: 'Sangat tidak setuju',
  mid: 'Netral',
  high: 'Sangat setuju',
};

function getScaleLabel(value, max, scaleLabels) {
  // 1. Custom labels from Google Form data
  if (scaleLabels?.[value]) return scaleLabels[value];
  // 2. Endpoints
  if (value === 1) return scaleLabels?.[1] || 'Rendah';
  if (value === max) return scaleLabels?.[max] || 'Tinggi';
  // 3. Middle
  if (value === Math.ceil(max / 2)) return 'Tengah';
  return String(value);
}

// ══════════════════════════════════════════════════════════════════
//  STICKER ANIMATION
// ══════════════════════════════════════════════════════════════════

const stickers = {
  low:  { emoji: '📝', text: 'Dicatat!' },
  mid:  { emoji: '👌', text: 'Masuk!' },
  high: { emoji: '✨', text: 'Nice!' },
  top:  { emoji: '🔥', text: 'Mantap!' },
};

function showSticker(value, max = 5) {
  const layer = document.querySelector('.sticker-layer');
  if (!layer) return;
  let key = 'mid';
  if (value <= Math.ceil(max * 0.35)) key = 'low';
  if (value >= Math.ceil(max * 0.72)) key = 'high';
  if (value === max) key = 'top';
  const data = stickers[key];
  const el = document.createElement('div');
  el.className = 'sticker';
  el.innerHTML = `<span>${data.emoji}</span><b>${data.text}</b>`;
  layer.appendChild(el);
  if (key === 'high' || key === 'top') {
    const colors = ['#ff7b7b', '#54c788', '#f1c76b', '#9c8cff', '#6ecbff'];
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = `${50 + (Math.random() * 48 - 24)}%`;
      c.style.top = `${38 + (Math.random() * 16 - 8)}%`;
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = `${Math.random() * 120}ms`;
      layer.appendChild(c);
      setTimeout(() => c.remove(), 1000);
    }
  }
  setTimeout(() => el.remove(), 820);
}

// ══════════════════════════════════════════════════════════════════
//  LANDING PAGE
// ══════════════════════════════════════════════════════════════════

function landing() {
  app.innerHTML = `
    <main class="app">
      <section class="panel landing">
        <span class="pill">✨ GForm → SwipeForm</span>
        <h1>Tempel link Google Form. Jadi versi swipe-card.</h1>
        <p class="lead">Tanpa database. Pertanyaan dibaca dari Google Form publik, lalu link SwipeForm bisa langsung dibagikan. Jawaban dikirim balik ke Google Form.</p>
        <div class="input-card">
          <label for="gformUrl">Link Google Form publik</label>
          <input
            id="gformUrl"
            type="url"
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
            autocomplete="off"
            spellcheck="false"
          />
          <button id="convertBtn" class="primary">Convert jadi SwipeForm →</button>
          <p id="status" class="status" role="alert" aria-live="polite"></p>
        </div>
        <div class="notes">
          <b>Support MVP:</b> skala 1–5/1–10, pilihan ganda, checkbox multi-pilih, jawaban pendek.<br>
          <b>Belum support:</b> upload file, wajib login Google, branching kompleks, form tertutup.
        </div>
      </section>
    </main>`;

  const btn = document.querySelector('#convertBtn');
  const input = document.querySelector('#gformUrl');
  btn.addEventListener('click', convert);
  // Allow Enter key to trigger convert
  input.addEventListener('keydown', e => { if (e.key === 'Enter') convert(); });
}

// ══════════════════════════════════════════════════════════════════
//  CONVERT (fetch API)
// ══════════════════════════════════════════════════════════════════

async function convert() {
  const input = document.querySelector('#gformUrl');
  const status = document.querySelector('#status');
  const btn = document.querySelector('#convertBtn');
  const url = input.value.trim();

  if (!url) {
    status.textContent = 'Masukkan link Google Form dulu.';
    input.focus();
    return;
  }

  status.textContent = 'Membaca Google Form...';
  btn.disabled = true;
  btn.textContent = 'Sedang diproses...';

  try {
    const res = await fetch(`/api/parse-gform?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal membaca form.');

    const config = {
      v: 1,
      title: data.title,
      formId: data.formId,
      submitUrl: data.submitUrl,
      questions: data.questions,
    };
    // Update URL to edit hash so page reload preserves state
    history.replaceState(null, '', `${location.pathname}#edit=${encodeConfig(config)}`);
    showResult(config);
  } catch (err) {
    // Translate generic network error into user-friendly message
    if (err.message === 'Failed to fetch') {
      status.textContent = 'Tidak bisa terhubung ke server. Jalankan dengan "npm run dev" (Vercel CLI) atau periksa koneksi internet.';
    } else {
      status.textContent = err.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Convert jadi SwipeForm →';
  }
}

// ══════════════════════════════════════════════════════════════════
//  RESULT PAGE (admin view)
// ══════════════════════════════════════════════════════════════════

function showResult(config) {
  const encoded = encodeConfig(config);
  const base = `${location.origin}${location.pathname}`;
  const respondentUrl = `${base}#play=${encoded}`;  // for form fillers
  const editUrl = `${base}#edit=${encoded}`;         // for admin to come back

  const charCount = respondentUrl.length;
  const tooLong = charCount > 2000;

  app.innerHTML = `
    <main class="app">
      <section class="panel result">
        <span class="pill">✅ Berhasil dikonversi</span>
        <h1>${escapeHtml(config.title)}</h1>
        <p class="lead">${config.questions.length} pertanyaan terbaca. Bagikan <b>Link Responden</b> ke orang yang akan mengisi, simpan <b>Link Admin</b> untuk kembali kelola.</p>

        ${tooLong ? `
          <div class="url-warning" role="alert">
            ⚠️ Link responden cukup panjang (${charCount} karakter). Beberapa platform (SMS, beberapa email) mungkin memotongnya.
            Pertimbangkan menyederhanakan form jika terjadi masalah.
          </div>` : ''}

        <div class="link-cards">

          <!-- RESPONDENT LINK -->
          <div class="link-card respondent-card">
            <div class="link-card-head">
              <span class="link-badge badge-play">🔗 Link Responden</span>
              <span class="link-card-desc">Share ke orang yang akan isi form</span>
            </div>
            <textarea id="respondentUrl" class="link-textarea" readonly rows="3">${respondentUrl}</textarea>
            <div class="link-actions">
              <button id="copyRespondentBtn" class="primary">Copy link responden</button>
              <a class="secondary" href="${respondentUrl}" target="_blank" rel="noopener">Preview ↗</a>
            </div>
          </div>

          <!-- ADMIN / EDIT LINK -->
          <div class="link-card edit-card">
            <div class="link-card-head">
              <span class="link-badge badge-edit">⚙️ Link Admin</span>
              <span class="link-card-desc">Bookmark untuk kembali kelola form ini</span>
            </div>
            <textarea id="editUrl" class="link-textarea" readonly rows="3">${editUrl}</textarea>
            <div class="link-actions">
              <button id="copyEditBtn" class="secondary-dark">Copy link admin</button>
            </div>
          </div>

        </div>

        <!-- Question preview -->
        <div class="q-preview">
          ${config.questions.map((q, i) => `
            <div class="q-item">
              <b>${i + 1}. ${escapeHtml(q.title)}</b>
              <span class="q-meta">
                ${q.kind}${q.max ? ` · 1–${q.max}` : ''}
                ${q.required ? '<span class="req-chip">Wajib</span>' : ''}
              </span>
            </div>`).join('')}
        </div>

        <button id="backBtn" class="ghost">← Convert form lain</button>
      </section>
    </main>`;

  // Copy respondent link
  document.querySelector('#copyRespondentBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(respondentUrl);
    const btn = document.querySelector('#copyRespondentBtn');
    btn.textContent = '✓ Tercopy!';
    setTimeout(() => { btn.textContent = 'Copy link responden'; }, 2200);
  });

  // Copy admin link
  document.querySelector('#copyEditBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(editUrl);
    const btn = document.querySelector('#copyEditBtn');
    btn.textContent = '✓ Tercopy!';
    setTimeout(() => { btn.textContent = 'Copy link admin'; }, 2200);
  });

  // Back with confirmation — answers aren't lost but config will be gone from URL
  document.querySelector('#backBtn').addEventListener('click', () => {
    if (confirm('Kembali ke halaman awal? Simpan link yang sudah dibuat dulu ya.')) {
      history.replaceState(null, '', location.pathname);
      landing();
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER (respondent view)
// ══════════════════════════════════════════════════════════════════

function player(config) {
  // BUG FIX: Guard against empty/invalid config
  if (!config?.questions?.length) {
    landing();
    return;
  }

  let index = 0;
  let currentValue = 3;
  const answers = {};

  // ── Render current question ───────────────────────────────────────
  function render() {
    const q = config.questions[index];
    const isScale = q.kind === 'scale';
    const max = q.max || 5;
    if (isScale) currentValue = answers[q.id] ?? Math.ceil(max / 2);

    // BUG FIX: Story bars — 100% for past, 0% for future, no fake 50%
    const storyBars = config.questions.map((_, i) =>
      `<div><span style="width:${i < index ? 100 : 0}%"></span></div>`
    ).join('');

    const isLast = index === config.questions.length - 1;

    app.innerHTML = `
      <main class="play">
        <div class="phone">
          <div class="sticker-layer"></div>
          <div class="top">
            <span class="pill">🎤 ${escapeHtml(config.title)}</span>
            <span class="count">${index + 1} / ${config.questions.length}</span>
          </div>
          <div class="story-bars">${storyBars}</div>

          ${isScale ? scalePanel(max, q.scaleLabels) : ''}

          <p class="hint">
            ${isScale
              ? 'Tarik kartu ke kiri/kanan. Skala ada di atas.'
              : 'Jawab pertanyaan ini, lalu klik Lanjut.'}
          </p>

          <section class="deck">
            <article id="card" class="card ${isScale ? '' : 'static-card'}">
              <div>
                <span class="tag">
                  Pertanyaan ${q.required ? '<span class="req-dot" title="Wajib diisi">●</span>' : ''}
                </span>
                ${isScale ? `<div id="chosen" class="chosen">${currentValue}</div>` : ''}
                <h2>${escapeHtml(q.title)}</h2>
              </div>
              ${isScale
                ? `<div class="card-footer">
                     <span>Geser kartu</span>
                     <span id="liveLabel" class="live-label">${getScaleLabel(currentValue, max, q.scaleLabels)}</span>
                   </div>`
                : answerControl(q)}
            </article>
          </section>

          <div class="actions">
            <button id="backBtn" class="secondary">← Balik</button>
            <button id="nextBtn" class="primary">${isLast ? 'Kirim 🚀' : 'Lanjut →'}</button>
          </div>

          <!-- iframe lives in body to survive app.innerHTML replacement during submit -->
        </div>
      </main>`;

    document.querySelector('#backBtn').addEventListener('click', () => {
      if (index > 0) { index--; render(); }
    });

    document.querySelector('#nextBtn').addEventListener('click', () => {
      // Save + validate
      if (!saveAnswer(q)) return;
      playSoundNext();
      goNext();
    });

    if (isScale) enableDrag(max, q);
  }

  // ── Scale panel (top of phone) ────────────────────────────────────
  function scalePanel(max, scaleLabels) {
    // For Likert scales (all values have labels), show short label in each box
    const hasAllLabels = scaleLabels &&
      Array.from({ length: max }, (_, i) => i + 1).every(v => scaleLabels[v]);

    const boxes = Array.from({ length: max }, (_, i) => {
      const val = i + 1;
      const isActive = val === currentValue;
      let display;
      if (hasAllLabels) {
        // Show first 2 chars of label as abbreviation (e.g. "SS", "S", "N", "TS", "STS")
        const label = scaleLabels[val] || String(val);
        // Build initials: take first letter of each word, max 3 chars
        const initials = label.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
        display = initials || String(val);
      } else {
        display = String(val);
      }
      return `<div class="scale-box ${isActive ? 'active' : ''}">${display}</div>`;
    }).join('');

    // Legend: use actual labels if available, otherwise generic
    const lowLabel  = scaleLabels?.[1]   || 'Rendah';
    const highLabel = scaleLabels?.[max] || 'Tinggi';

    return `
      <div class="scale-panel">
        <div class="scale-row" id="scaleBoxes" style="grid-template-columns:repeat(${max},1fr)">
          ${boxes}
        </div>
        <div class="scale-legend"><span>${escapeHtml(lowLabel)}</span><span>${escapeHtml(highLabel)}</span></div>
      </div>`;
  }


  // ── Answer input renderer ─────────────────────────────────────────
  function answerControl(q) {
    if (q.kind === 'choice') {
      return `<div class="choice-list">
        ${(q.options || []).map(opt => `
          <label class="choice">
            <input type="radio" name="choice_${q.id}" value="${escapeAttr(opt)}"
              ${answers[q.id] === opt ? 'checked' : ''} />
            <span>${escapeHtml(opt)}</span>
          </label>`).join('')}
      </div>`;
    }

    // BUG FIX: Checkbox is multi-select — different element AND different submit logic
    if (q.kind === 'checkbox') {
      const savedArr = Array.isArray(answers[q.id]) ? answers[q.id] : [];
      return `<div class="choice-list">
        ${(q.options || []).map(opt => `
          <label class="choice checkbox-choice">
            <input type="checkbox" name="checkbox_${q.id}" value="${escapeAttr(opt)}"
              ${savedArr.includes(opt) ? 'checked' : ''} />
            <span>${escapeHtml(opt)}</span>
          </label>`).join('')}
      </div>`;
    }

    return `<textarea id="textAnswer" class="text-answer" placeholder="Tulis jawaban..." rows="4">${escapeHtml(answers[q.id] || '')}</textarea>`;
  }

  // ── Save + validate current answer ───────────────────────────────
  function saveAnswer(q) {
    if (q.kind === 'scale') {
      answers[q.id] = currentValue;
      return true;
    }
    if (q.kind === 'choice') {
      const checked = document.querySelector(`input[name="choice_${q.id}"]:checked`);
      if (checked) answers[q.id] = checked.value;
      if (q.required && !answers[q.id]) { shakeRequired(); return false; }
      return true;
    }
    if (q.kind === 'checkbox') {
      const checked = [...document.querySelectorAll(`input[name="checkbox_${q.id}"]:checked`)]
        .map(el => el.value);
      if (checked.length) answers[q.id] = checked;
      if (q.required && !answers[q.id]?.length) { shakeRequired(); return false; }
      return true;
    }
    if (q.kind === 'text') {
      answers[q.id] = document.querySelector('#textAnswer')?.value?.trim() || '';
      if (q.required && !answers[q.id]) { shakeRequired(); return false; }
      return true;
    }
    return true;
  }

  /** Show shake animation + error message inside card */
  function shakeRequired() {
    const card = document.querySelector('#card');
    if (!card) return;
    card.classList.remove('shake');
    // Force reflow to restart animation
    void card.offsetWidth;
    card.classList.add('shake');
    document.querySelector('.req-error')?.remove();
    const msg = document.createElement('p');
    msg.className = 'req-error';
    msg.textContent = '⚠️ Pertanyaan ini wajib diisi.';
    card.appendChild(msg);
    setTimeout(() => { card.classList.remove('shake'); msg.remove(); }, 2400);
  }

  // ── Drag / swipe for scale cards ─────────────────────────────────
  function enableDrag(max, q) {
    const card = document.querySelector('#card');
    const chosen = document.querySelector('#chosen');
    const liveLabel = document.querySelector('#liveLabel');
    let dragging = false, startX = 0, currentX = 0;
    let lastSoundValue = currentValue;

    function updateValue(raw) {
      const newVal = Math.max(1, Math.min(max, Number(raw)));
      if (newVal !== currentValue) {
        currentValue = newVal;
        // Only play sound when the value actually changes
        if (currentValue !== lastSoundValue) {
          playSoundSwipe(currentValue, max);
          lastSoundValue = currentValue;
        }
      }
      chosen.textContent = currentValue;
      liveLabel.textContent = getScaleLabel(currentValue, max, q.scaleLabels);
      document.querySelectorAll('.scale-box').forEach((box, i) =>
        box.classList.toggle('active', i + 1 === currentValue)
      );
    }

    function valueFromX(x) {
      const rect = document.querySelector('.phone').getBoundingClientRect();
      const relative = (x - rect.left) / rect.width;
      return Math.max(1, Math.min(max, Math.ceil(relative * max)));
    }

    card.addEventListener('pointerdown', e => {
      dragging = true;
      card.setPointerCapture(e.pointerId);
      startX = currentX = e.clientX;
      card.style.transition = 'none';
    });

    card.addEventListener('pointermove', e => {
      if (!dragging) return;
      currentX = e.clientX;
      const dx = currentX - startX;
      const rotate = dx / 18;
      const lift = Math.min(Math.abs(dx) / 12, 16);
      card.style.transform = `translateX(${dx}px) translateY(${-lift}px) rotate(${rotate}deg)`;
      updateValue(valueFromX(currentX));
    });

    card.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      answers[q.id] = currentValue;
      const dx = currentX - startX;
      if (Math.abs(dx) > 72) {
        flyOut(dx > 0 ? 1 : -1, max);
      } else {
        card.style.transition = 'transform .22s ease';
        card.style.transform = 'translateX(0) translateY(0) rotate(0)';
      }
    });
  }

  function flyOut(direction, max) {
    const card = document.querySelector('#card');
    showSticker(currentValue, max);
    playSoundNext();
    card.style.transition = 'transform .30s ease, opacity .30s ease';
    card.style.transform = `translateX(${direction * 520}px) rotate(${direction * 24}deg)`;
    card.style.opacity = '0';
    setTimeout(goNext, 560);
  }

  function goNext() {
    if (index < config.questions.length - 1) {
      index++;
      render();
    } else {
      submit();
    }
  }

  // ── Submit ────────────────────────────────────────────────────────
  function submit() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = config.submitUrl;
    form.style.display = 'none';

    // BUG FIX: Move iframe to body BEFORE replacing app.innerHTML
    // so it stays alive during form submission
    let iframe = document.querySelector('iframe[name="hiddenSubmit"]');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.name = 'hiddenSubmit';
      iframe.style.display = 'none';
    }
    document.body.appendChild(iframe);
    form.target = 'hiddenSubmit';

    for (const q of config.questions) {
      const value = answers[q.id];
      if (value == null || value === '') continue;

      // BUG FIX: Checkbox answers are arrays — send as multiple fields with same name
      if (Array.isArray(value)) {
        for (const v of value) {
          const inp = document.createElement('input');
          inp.name = `entry.${q.id}`;
          inp.value = String(v);
          form.appendChild(inp);
        }
      } else {
        const inp = document.createElement('input');
        inp.name = `entry.${q.id}`;
        inp.value = String(value);
        form.appendChild(inp);
      }
    }

    document.body.appendChild(form);
    form.submit();
    playSoundDone();

    // Compute average for scale questions
    const scaleVals = config.questions
      .filter(q => q.kind === 'scale')
      .map(q => Number(answers[q.id]))
      .filter(Number.isFinite);
    const avg = scaleVals.length
      ? scaleVals.reduce((a, b) => a + b, 0) / scaleVals.length
      : null;

    app.innerHTML = `
      <main class="app">
        <section class="panel done">
          <span class="pill">🎉 Terkirim</span>
          <h1>Jawabanmu masuk!</h1>
          ${avg ? `<div class="score">${avg.toFixed(1)}<span>rata-rata</span></div>` : ''}
          <p class="lead">Terima kasih sudah mengisi survei. Jawaban dikirim ke Google Form pemilik survei.</p>
        </section>
      </main>`;

    // Cleanup after submit
    setTimeout(() => {
      form.remove();
      iframe.remove();
    }, 2500);
  }

  render();
}

// ══════════════════════════════════════════════════════════════════
//  ROUTER — read URL hash to decide which view to show
// ══════════════════════════════════════════════════════════════════

try {
  const { play, edit } = getHashParams();
  if (play) {
    player(decodeConfig(play));           // Respondent link → swipe player
  } else if (edit) {
    showResult(decodeConfig(edit));       // Admin link → result/manage page
  } else {
    landing();                            // No hash → landing page
  }
} catch (_) {
  // Corrupt hash or decoding error — fall back to landing
  landing();
}
