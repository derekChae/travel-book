// 발행: 비밀번호를 아는 사람만 열 수 있는 읽기 전용 페이지
// 페이지 전체(글+사진)를 이 기기에서 암호화(AES-GCM, 비밀번호→PBKDF2)한 뒤 올림. 서버에는 암호문만 있음.
(() => {
const { S, $, esc, toast } = App;
const ITER = 310000;
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const slugGen = () => [...rand(10)].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');

async function encrypt(text, password) {
  const salt = rand(16), iv = rand(12);
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  const all = new Uint8Array(16 + 12 + ct.length); all.set(salt); all.set(iv, 16); all.set(ct, 28);
  return b64(all);
}

async function dataUrl(p, max) {
  const url = await App.urlFor(p.id + (max > 1600 ? ':print' : ':disp'));
  const img = new Image(); img.src = url; await img.decode();
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.84);
}

// 발행본 = 사진 위주 이야기 화면 (읽기 전용)
async function bookPage(t, onProgress) {
  const { info, sctx } = App.storyCtx(t);
  const big = new Set([sctx.cover && sctx.cover.id, ...sctx.shown.filter(p => Story.isHero(p)).map(p => p.id)].filter(Boolean));
  const urls = new Map(); let k = 0;
  for (const p of sctx.shown) { urls.set(p.id, await dataUrl(p, big.has(p.id) ? 2400 : 1400)); onProgress && onProgress(++k, sctx.shown.length); }
  const { sctx: ro } = App.storyCtx(t, { edit: false, img: p => `src="${urls.get(p.id)}"` });
  const css = await (await fetch('story.css')).text();
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex">
<title>${esc(info.title)}</title>
<link rel="stylesheet" href="https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css">
<style>html,body{margin:0;background:#fbfaf7}${css}</style></head>
<body>${Story.storyHTML(ro)}</body></html>`;
}

function lockedPage(cipher) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>나의 여행책</title>
<link rel="stylesheet" href="https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111110;color:#f1f0ec;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
form{width:min(340px,86vw)}h1{font-family:MaruBuriBold,"AppleMyungjo",serif;font-weight:700;font-size:34px;letter-spacing:-.04em;margin:0 0 6px}p{color:#a9a69f;font-size:14px;margin:0 0 22px}
input{width:100%;box-sizing:border-box;height:50px;border-radius:12px;border:1px solid #444;background:#1c1c1a;color:#fff;font-size:17px;padding:0 14px}button{margin-top:10px;width:100%;height:50px;border:0;border-radius:12px;background:#f1f0ec;color:#111;font-size:16px;font-weight:600}
#e{color:#ff9d8f;min-height:20px;margin-top:10px;font-size:14px}</style></head>
<body><form id="f"><h1>나의 여행책</h1><p>비밀번호를 넣으면 열려요</p><input id="pw" type="password" autocomplete="current-password" aria-label="비밀번호" autofocus><button>열기</button><div id="e" role="alert"></div></form>
<script>
const D="${cipher}";
document.getElementById('f').addEventListener('submit',async ev=>{ev.preventDefault();const e=document.getElementById('e');e.textContent='여는 중…';
try{const a=Uint8Array.from(atob(D),c=>c.charCodeAt(0));const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.getElementById('pw').value),'PBKDF2',false,['deriveKey']);
const k=await crypto.subtle.deriveKey({name:'PBKDF2',salt:a.slice(0,16),iterations:${ITER},hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
const h=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:a.slice(16,28)},k,a.slice(28)));document.open();document.write(h);document.close();}
catch(x){e.textContent='비밀번호가 맞지 않아요';}});
</script></body></html>`;
}

// ----- GitHub에 올리기 -----
async function gh() { return (await DB.getMeta('github')) || null; }
async function ghPut(cfg, path, content, message) {
  const api = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  const H = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' };
  let sha;
  const cur = await fetch(api + '?ref=' + (cfg.branch || 'main'), { headers: H });
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(`GitHub 확인 실패 (${cur.status})`);
  const r = await fetch(api, { method: 'PUT', headers: H, body: JSON.stringify({ message, content, branch: cfg.branch || 'main', ...(sha ? { sha } : {}) }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`올리기 실패 (${r.status}) ${j.message || ''}`); }
  return r.json();
}
async function ghDelete(cfg, path) {
  const api = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
  const H = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' };
  const cur = await fetch(api, { headers: H }); if (!cur.ok) return;
  const { sha } = await cur.json();
  await fetch(api, { method: 'DELETE', headers: H, body: JSON.stringify({ message: '발행 취소', sha, branch: cfg.branch || 'main' }) });
}
const pageUrl = (cfg, slug) => `https://${cfg.owner.toLowerCase()}.github.io/${cfg.repo}/p/${slug}.html`;

function setupSheet(after) {
  const sh = App.openSheet(`<h3>GitHub 연결 (처음 한 번)</h3>
    <p>발행한 페이지를 올릴 곳이에요. 올라가는 건 암호문뿐이라 비밀번호 없이는 아무도 못 봐요.</p>
    <ol style="margin:0 0 10px;padding-left:20px;display:grid;gap:4px;font-size:14.5px">
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub 토큰 만들기</a>를 열어요</li>
      <li>Repository access → <b>Only select repositories</b> → 여행책 저장소 선택</li>
      <li>Permissions → <b>Contents: Read and write</b> → 만들기</li>
      <li>나온 토큰을 아래에 붙여넣어요</li>
    </ol>
    <input type="text" id="gh-owner" placeholder="GitHub 아이디" value="derekChae" style="margin-bottom:8px">
    <input type="text" id="gh-repo" placeholder="저장소 이름" value="travel-book" style="margin-bottom:8px">
    <input type="password" id="gh-token" placeholder="토큰 (github_pat_...)" autocomplete="off">
    <div class="saved" id="gh-st">토큰은 이 기기에만 저장돼요.</div>
    <div class="sheet-actions"><button data-close>취소</button><button class="done" id="gh-save">저장</button></div>`);
  $('#gh-save', sh).addEventListener('click', async () => {
    const cfg = { owner: $('#gh-owner', sh).value.trim(), repo: $('#gh-repo', sh).value.trim(), token: $('#gh-token', sh).value.trim(), branch: 'main' };
    const st = $('#gh-st', sh);
    if (!cfg.owner || !cfg.repo || !cfg.token) { st.textContent = '세 칸을 모두 채워 주세요'; return; }
    st.textContent = '확인 중…';
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    if (!r.ok) { st.textContent = `연결하지 못했어요 (${r.status}). 토큰과 저장소 이름을 확인해 주세요.`; return; }
    const j = await r.json(); if (j.permissions && !j.permissions.push) { st.textContent = '이 토큰은 쓰기 권한이 없어요. Contents: Read and write로 만들어 주세요.'; return; }
    await DB.setMeta('github', cfg); App.closeSheet(true); toast('GitHub에 연결했어요'); after && after();
  });
}

async function open(t) {
  const cfg = await gh();
  const pw = (await DB.getMeta('publishPassword')) || '';
  const url = cfg && t.publishSlug ? pageUrl(cfg, t.publishSlug) : '';
  const sh = App.openSheet(`<h3>발행</h3>
    <p>비밀번호를 아는 사람만 볼 수 있는 읽기 전용 페이지로 올려요. 링크와 비밀번호를 같이 알려주면 돼요.</p>
    ${t.published && url ? `<div class="tip">지금 발행돼 있어요<br><a href="${url}" target="_blank" rel="noopener">${esc(url)}</a><br><small>고친 내용은 다시 발행해야 반영돼요.</small></div>` : ''}
    <label class="seg-label" for="pub-pw">비밀번호 (모든 여행에 같이 써요)</label>
    <input type="text" id="pub-pw" value="${esc(pw)}" placeholder="보여줄 사람에게 알려줄 비밀번호" autocomplete="off" style="margin-top:6px">
    <div class="saved" id="pub-st"></div>
    <div class="sheet-actions">
      ${t.published ? '<button class="danger" id="pub-off">발행 취소</button>' : ''}
      <button id="pub-file">파일로 저장</button>
      <button class="done" id="pub-go">${cfg ? (t.published ? '다시 발행' : '링크로 발행') : 'GitHub 연결하고 발행'}</button>
    </div>`);
  const st = $('#pub-st', sh);
  const make = async () => {
    const pass = $('#pub-pw', sh).value.trim();
    if (pass.length < 4) { st.textContent = '비밀번호를 4자 이상 넣어 주세요'; return null; }
    await DB.setMeta('publishPassword', pass);
    const html = await bookPage(t, (k, n) => { st.textContent = `사진 준비 중 ${k}/${n}`; });
    st.textContent = '암호화하는 중…';
    return lockedPage(await encrypt(html, pass));
  };
  $('#pub-file', sh).addEventListener('click', async () => {
    const page = await make(); if (!page) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([page], { type: 'text/html' })); a.download = `${App.tripInfo(t).title}-발행본.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); st.textContent = '저장했어요. 이 파일을 보내면 비밀번호로 열 수 있어요.';
  });
  $('#pub-go', sh).addEventListener('click', async () => {
    const c = await gh(); if (!c) { App.closeSheet(true); setupSheet(() => open(t)); return; }
    const page = await make(); if (!page) return;
    try {
      st.textContent = '올리는 중…';
      t.publishSlug = t.publishSlug || slugGen();
      await ghPut(c, `p/${t.publishSlug}.html`, b64(new TextEncoder().encode(page)), `발행: ${t.publishSlug}`);
      t.published = true; t.publishedAt = new Date().toISOString(); await DB.putTrip(t);
      const u = pageUrl(c, t.publishSlug);
      try { await navigator.clipboard.writeText(u); } catch { }
      st.innerHTML = `발행했어요. 링크를 복사해 뒀어요 (반영까지 1분쯤 걸려요).<br><a href="${u}" target="_blank" rel="noopener">${esc(u)}</a>`;
    } catch (e) { st.textContent = e.message; }
  });
  $('#pub-off', sh)?.addEventListener('click', async () => {
    if (!confirm('발행을 취소할까요? 링크로 더 이상 볼 수 없어요.')) return;
    const c = await gh(); if (c && t.publishSlug) await ghDelete(c, `p/${t.publishSlug}.html`);
    t.published = false; await DB.putTrip(t); App.closeSheet(); toast('발행을 취소했어요');
  });
}

window.Publish = { open, encrypt, lockedPage, bookPage, setupSheet };
})();
