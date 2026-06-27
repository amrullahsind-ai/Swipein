import './style.css';

const app = document.querySelector('#app');
const labels = {1:'Sangat tidak',2:'Kurang',3:'Netral',4:'Setuju',5:'Sangat setuju',6:'6',7:'7',8:'8',9:'9',10:'Sangat tinggi'};
const stickers = {low:{emoji:'📝',text:'Dicatat!'},mid:{emoji:'👌',text:'Masuk!'},high:{emoji:'✨',text:'Nice!'},top:{emoji:'🔥',text:'Mantap!'}};

function encodeConfig(config){
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function decodeConfig(encoded){
  const base64 = encoded.replace(/-/g,'+').replace(/_/g,'/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array([...binary].map(ch=>ch.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function getHashConfig(){
  const hash = new URLSearchParams(location.hash.slice(1));
  const data = hash.get('data');
  return data ? decodeConfig(data) : null;
}
function escapeHtml(value){return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function escapeAttr(value){return escapeHtml(value).replaceAll('\n',' ');}

function showSticker(value,max=5){
  const layer=document.querySelector('.sticker-layer'); if(!layer) return;
  let key='mid';
  if(value <= Math.ceil(max*.35)) key='low';
  if(value >= Math.ceil(max*.72)) key='high';
  if(value === max) key='top';
  const data=stickers[key];
  const el=document.createElement('div');
  el.className='sticker';
  el.innerHTML=`<span>${data.emoji}</span><b>${data.text}</b>`;
  layer.appendChild(el);
  if(key==='high'||key==='top'){
    const colors=['#ff7b7b','#54c788','#f1c76b','#9c8cff','#6ecbff'];
    for(let i=0;i<16;i++){
      const c=document.createElement('div');
      c.className='confetti';
      c.style.left=`${50+(Math.random()*48-24)}%`;
      c.style.top=`${38+(Math.random()*16-8)}%`;
      c.style.background=colors[Math.floor(Math.random()*colors.length)];
      c.style.animationDelay=`${Math.random()*120}ms`;
      layer.appendChild(c); setTimeout(()=>c.remove(),1000);
    }
  }
  setTimeout(()=>el.remove(),820);
}

function landing(){
  app.innerHTML=`
    <main class="app">
      <section class="panel landing">
        <span class="pill">✨ GForm → SwipeForm</span>
        <h1>Tempel link Google Form. Jadi versi swipe-card.</h1>
        <p class="lead">Tanpa database. Pertanyaan dibaca dari Google Form publik, lalu link SwipeForm bisa langsung dibagikan. Jawaban dikirim balik ke Google Form.</p>
        <div class="input-card">
          <label>Link Google Form publik</label>
          <input id="gformUrl" placeholder="https://docs.google.com/forms/d/e/.../viewform" />
          <button id="convertBtn" class="primary">Convert jadi SwipeForm →</button>
          <p id="status" class="status"></p>
        </div>
        <div class="notes"><b>Support MVP:</b> skala 1–5/1–10, pilihan ganda sederhana, jawaban pendek.<br><b>Belum support:</b> upload file, wajib login Google, branching rumit, form tertutup.</div>
      </section>
    </main>`;
  document.querySelector('#convertBtn').addEventListener('click', convert);
}

async function convert(){
  const input=document.querySelector('#gformUrl');
  const status=document.querySelector('#status');
  const url=input.value.trim();
  if(!url){status.textContent='Masukkan link Google Form dulu.'; return;}
  status.textContent='Membaca Google Form...';
  try{
    const res=await fetch(`/api/parse-gform?url=${encodeURIComponent(url)}`);
    const data=await res.json();
    if(!res.ok) throw new Error(data.error || 'Gagal membaca form.');
    const config={v:1,title:data.title,formId:data.formId,submitUrl:data.submitUrl,questions:data.questions};
    const shareUrl=`${location.origin}${location.pathname}#data=${encodeConfig(config)}`;
    app.innerHTML=`
      <main class="app">
        <section class="panel result">
          <span class="pill">✅ Berhasil dibuat</span>
          <h1>${escapeHtml(data.title)}</h1>
          <p class="lead">${data.questions.length} pertanyaan terbaca. Link ini bisa dibagikan ke responden.</p>
          <div class="share-box">
            <label>Link SwipeForm</label>
            <textarea id="shareUrl" readonly>${shareUrl}</textarea>
            <div class="share-actions"><button id="copyBtn" class="primary">Copy link</button><a class="secondary" href="${shareUrl}">Preview</a></div>
          </div>
          <div class="q-preview">${data.questions.map((q,i)=>`<div><b>${i+1}. ${escapeHtml(q.title)}</b><span>${q.kind}${q.max?` · 1–${q.max}`:''}</span></div>`).join('')}</div>
          <button id="backBtn" class="ghost">← Convert form lain</button>
        </section>
      </main>`;
    document.querySelector('#copyBtn').addEventListener('click', async()=>{await navigator.clipboard.writeText(shareUrl); document.querySelector('#copyBtn').textContent='Tercopy ✓';});
    document.querySelector('#backBtn').addEventListener('click', landing);
  }catch(err){status.textContent=err.message;}
}

function player(config){
  let index=0; let currentValue=3; const answers={};
  function render(){
    const q=config.questions[index]; const isScale=q.kind==='scale'; const max=q.max||5; const saved=answers[q.id];
    if(isScale) currentValue=saved || Math.ceil(max/2);
    app.innerHTML=`
      <main class="play">
        <div class="phone">
          <div class="sticker-layer"></div>
          <div class="top"><span class="pill">🎤 ${escapeHtml(config.title)}</span><span class="count">${index+1}/${config.questions.length}</span></div>
          <div class="story-bars">${config.questions.map((_,i)=>`<div><span style="width:${i<index?100:i===index?50:0}%"></span></div>`).join('')}</div>
          ${isScale ? scalePanel(max) : ''}
          <p class="hint">${isScale?'Tarik kartu ke kiri/kanan. Skala ada di atas.':'Jawab pertanyaan ini, lalu lanjut.'}</p>
          <section class="deck">
            <article id="card" class="card ${isScale?'':'static-card'}">
              <div><span class="tag">Pertanyaan</span>${isScale?`<div id="chosen" class="chosen">${currentValue}</div>`:''}<h2>${escapeHtml(q.title)}</h2></div>
              ${isScale?`<div class="card-footer"><span>Geser kartu</span><span id="liveLabel" class="live-label">${labels[currentValue]||currentValue}</span></div>`:answerControl(q)}
            </article>
          </section>
          <div class="actions"><button id="backBtn" class="secondary">← Balik</button><button id="nextBtn" class="primary">${index===config.questions.length-1?'Kirim →':'Lanjut →'}</button></div>
          <iframe name="hiddenSubmit" class="hidden-frame"></iframe>
        </div>
      </main>`;
    document.querySelector('#backBtn').addEventListener('click',()=>{if(index>0){index--; render();}});
    document.querySelector('#nextBtn').addEventListener('click',()=>{saveNonScale(q); if(isScale) answers[q.id]=currentValue; next();});
    if(isScale) enableDrag(max);
  }
  function scalePanel(max){return `<div class="scale-panel"><div class="scale-row" id="scaleBoxes" style="grid-template-columns:repeat(${max},1fr)">${Array.from({length:max},(_,i)=>`<div class="scale-box ${i+1===currentValue?'active':''}">${i+1}</div>`).join('')}</div><div class="scale-legend"><span>Rendah</span><span>Tinggi</span></div></div>`;}
  function answerControl(q){
    if(q.kind==='choice') return `<div class="choice-list">${(q.options||[]).map(opt=>`<label class="choice"><input type="radio" name="choice" value="${escapeAttr(opt)}" ${answers[q.id]===opt?'checked':''}/><span>${escapeHtml(opt)}</span></label>`).join('')}</div>`;
    return `<textarea id="textAnswer" class="text-answer" placeholder="Tulis jawaban..." rows="4">${escapeHtml(answers[q.id]||'')}</textarea>`;
  }
  function saveNonScale(q){
    if(q.kind==='choice'){const checked=document.querySelector('input[name="choice"]:checked'); if(checked) answers[q.id]=checked.value;}
    if(q.kind==='text') answers[q.id]=document.querySelector('#textAnswer')?.value || '';
  }
  function enableDrag(max){
    const card=document.querySelector('#card'); const chosen=document.querySelector('#chosen'); const liveLabel=document.querySelector('#liveLabel');
    let dragging=false,startX=0,currentX=0;
    function updateValue(value){currentValue=Math.max(1,Math.min(max,Number(value))); chosen.textContent=currentValue; liveLabel.textContent=labels[currentValue]||currentValue; document.querySelectorAll('.scale-box').forEach((box,i)=>box.classList.toggle('active',i+1===currentValue));}
    function valueFromX(x){const rect=document.querySelector('.phone').getBoundingClientRect(); const relative=(x-rect.left)/rect.width; return Math.max(1,Math.min(max,Math.ceil(relative*max)));}
    card.addEventListener('pointerdown',e=>{dragging=true; card.setPointerCapture(e.pointerId); startX=e.clientX; currentX=e.clientX; card.style.transition='none';});
    card.addEventListener('pointermove',e=>{if(!dragging)return; currentX=e.clientX; const dx=currentX-startX; const rotate=dx/18; const lift=Math.min(Math.abs(dx)/12,16); card.style.transform=`translateX(${dx}px) translateY(${-lift}px) rotate(${rotate}deg)`; updateValue(valueFromX(currentX));});
    card.addEventListener('pointerup',()=>{if(!dragging)return; dragging=false; answers[config.questions[index].id]=currentValue; const dx=currentX-startX; if(Math.abs(dx)>72) flyOut(dx>0?1:-1,max); else {card.style.transition='transform .22s ease'; card.style.transform='translateX(0) translateY(0) rotate(0)';}});
  }
  function flyOut(direction,max){const card=document.querySelector('#card'); showSticker(currentValue,max); card.style.transition='transform .30s ease, opacity .30s ease'; card.style.transform=`translateX(${direction*520}px) rotate(${direction*24}deg)`; card.style.opacity='0'; setTimeout(next,560);}
  function next(){if(index<config.questions.length-1){index++; render();}else submit();}
  function submit(){
    const form=document.createElement('form'); form.method='POST'; form.action=config.submitUrl; form.target='hiddenSubmit'; form.style.display='none';
    for(const q of config.questions){const value=answers[q.id]; if(value==null || value==='') continue; const input=document.createElement('input'); input.name=`entry.${q.id}`; input.value=String(value); form.appendChild(input);}
    document.body.appendChild(form); form.submit();
    const avgValues=config.questions.filter(q=>q.kind==='scale').map(q=>Number(answers[q.id])).filter(Number.isFinite);
    const avg=avgValues.length ? avgValues.reduce((a,b)=>a+b,0)/avgValues.length : null;
    app.innerHTML=`<main class="app"><section class="panel done"><span class="pill">✅ Terkirim</span><h1>Jawabanmu masuk.</h1>${avg?`<div class="score">${avg.toFixed(1)}<span>rata-rata</span></div>`:''}<p class="lead">Terima kasih. Jawaban dikirim ke Google Form pemilik survei.</p></section></main>`;
    setTimeout(()=>form.remove(),1500);
  }
  render();
}

try{const config=getHashConfig(); if(config) player(config); else landing();}catch(err){landing();}
