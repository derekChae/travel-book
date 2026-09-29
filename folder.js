// 카메라 폴더 연결: 한 번 연결해 두면 사진을 한 장씩 고를 필요 없이 '날짜'만 골라서 한 번에 넣음
(() => {
const { S, $, esc, toast } = App;
const hasDirPicker = 'showDirectoryPicker' in window;
const hasDirInput = (() => { const i = document.createElement('input'); return 'webkitdirectory' in i; })();
const isAndroid = /Android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const IMG = /\.(jpe?g|png|heic|heif|webp|mp4|mov|m4v|webm|3gp)$/i;
const VID = /\.(mp4|mov|m4v|webm|3gp)$/i;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = n => String(n).padStart(2, '0');
const localDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// 파일 이름에 찍은 날짜가 들어 있으면 그걸로 (갤럭시: 20260510_090122.jpg). 없으면 파일 날짜.
function dayFromName(name) {
  const m = name.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})_(\d{6})/);
  if (!m || name.startsWith('PXL_')) return null; // 픽셀 폰 이름은 세계 표준시라 제외
  const mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ----- 폴더 읽기 -----
async function listFromHandle(dir, depth = 0, out = []) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'directory') { if (depth < 2) await listFromHandle(h, depth + 1, out); continue; }
    if (!IMG.test(name)) continue;
    out.push({ name, handle: h, day: dayFromName(name) });
  }
  return out;
}
async function fillDays(items, onProgress) {
  let k = 0;
  for (const it of items) {
    k++;
    if (!it.day) {
      const f = it.file || await it.handle.getFile(); it.file = f; it.day = localDay(f.lastModified);
    }
    if (onProgress && k % 200 === 0) onProgress(k, items.length);
  }
  return items;
}
const getFile = async it => it.file || (it.file = await it.handle.getFile());

async function savedHandle() { try { return await DB.getMeta('cameraDir'); } catch { return null; } }
async function ensurePermission(h) {
  if (!h || !h.queryPermission) return false;
  let p = await h.queryPermission({ mode: 'read' });
  if (p === 'granted') return true;
  try { p = await h.requestPermission({ mode: 'read' }); } catch { return false; }
  return p === 'granted';
}

// ----- 진입 -----
async function start() {
  if (hasDirPicker) {
    const h = await savedHandle();
    if (h && await ensurePermission(h)) return scanHandle(h);
    return guide();
  }
  if (hasDirInput && !isIOS) return guide();
  // 아이폰은 사진이 폴더가 아니라서 사진 선택창으로
  Actions.pickFiles();
}

function guide() {
  const sh = App.openSheet(`<h3>카메라 폴더를 한 번만 연결해 주세요</h3>
    <p style="margin:0 0 10px">연결해 두면 사진을 한 장씩 고를 필요 없이 <b>여행 날짜만 톡톡</b> 눌러서 한 번에 넣을 수 있어요.</p>
    <ol style="margin:0 0 6px;padding-left:20px;display:grid;gap:4px">
      ${isAndroid ? '<li>열리는 창에서 <b>DCIM</b> → <b>Camera</b> 폴더로 들어가요</li><li>아래 <b>이 폴더 사용</b> → <b>허용</b>을 눌러요</li>'
        : '<li>사진이 들어 있는 폴더를 골라요</li><li><b>업로드</b> 또는 <b>허용</b>을 눌러요 (실제로 어디에 올라가진 않아요)</li>'}
    </ol>
    <div class="tip">사진은 이 폰 안에서만 읽어요. 인터넷으로 보내지 않아요.</div>
    <div class="sheet-actions"><button data-act="pick-files-direct">사진 직접 고르기</button><button class="done" id="connect">카메라 폴더 연결</button></div>`);
  $('#connect', sh).addEventListener('click', async () => {
    if (hasDirPicker) {
      let h;
      try { h = await window.showDirectoryPicker({ id: 'camera', mode: 'read', startIn: 'pictures' }); }
      catch (e) { if (e.name !== 'AbortError') toast('폴더를 열지 못했어요'); return; }
      try { await DB.setMeta('cameraDir', h); } catch { /* 저장 못 해도 이번엔 진행 */ }
      App.closeSheet(true); scanHandle(h);
    } else {
      const inp = document.createElement('input'); inp.type = 'file'; inp.webkitdirectory = true; inp.multiple = true;
      inp.addEventListener('change', async () => {
        const items = [...inp.files].filter(f => IMG.test(f.name)).map(f => ({ name: f.name, file: f, day: dayFromName(f.name) }));
        App.closeSheet(true); await scanItems(items);
      });
      inp.click();
    }
  });
}

async function scanHandle(h) {
  const sh = App.openSheet(`<h3>사진 살펴보는 중</h3><div class="saved" id="scan-st">폴더를 읽고 있어요…</div>`);
  let items;
  try { items = await listFromHandle(h); }
  catch (e) { App.closeSheet(true); toast('폴더를 읽지 못했어요. 다시 연결해 주세요.'); await DB.setMeta('cameraDir', null).catch(() => { }); return; }
  await scanItems(items, sh);
}

async function scanItems(items, sh) {
  if (!sh) sh = App.openSheet(`<h3>사진 살펴보는 중</h3><div class="saved" id="scan-st"></div>`);
  const st = $('#scan-st', sh);
  await fillDays(items, (k, n) => { if (st) st.textContent = `${k} / ${n}`; });
  if (!items.length) { App.closeSheet(true); toast('이 폴더에는 사진이 없어요. DCIM → Camera 폴더를 골라 주세요.', 4000); return; }
  App.closeSheet(true);
  dayPicker(items);
}

// ----- 날짜 고르기 -----
function dayPicker(items) {
  const have = new Set(S.photos.map(p => p.fileName));
  const byDay = new Map();
  items.forEach(it => { if (!byDay.has(it.day)) byDay.set(it.day, []); byDay.get(it.day).push(it); });
  const days = [...byDay.keys()].sort().reverse();
  const sel = new Set();
  let shown = 60;
  const sh = App.openSheet(`<h3>넣을 날짜를 골라주세요</h3>
    <p class="saved" style="margin:-6px 0 10px">여행 간 날들만 톡톡 누르면 돼요. 사진은 한 장씩 안 골라도 돼요.</p>
    <div class="days" id="days"></div>
    <div class="day-go"><button class="btn-main" id="go" disabled>날짜를 골라주세요</button></div>`);
  const box = $('#days', sh), go = $('#go', sh);
  const draw = () => {
    let lastMonth = '';
    box.innerHTML = days.slice(0, shown).map(d => {
      const [y, m, dd] = d.split('-').map(Number); const wd = WD[new Date(y, m - 1, dd).getDay()];
      const list = byDay.get(d); const done = list.filter(it => have.has(it.name)).length;
      const month = `${y}년 ${m}월`; const head = month !== lastMonth ? `<div class="month">${month}</div>` : ''; lastMonth = month;
      return `${head}<button class="day-row${sel.has(d) ? ' on' : ''}" data-d="${d}" aria-pressed="${sel.has(d)}">
        <span class="ck" aria-hidden="true"></span>
        <span class="dl"><b>${m}월 ${dd}일 ${wd}요일</b><small>${list.filter(it => !VID.test(it.name)).length}장${list.some(it => VID.test(it.name)) ? ` · 영상 ${list.filter(it => VID.test(it.name)).length}` : ''}${done ? ` · ${done === list.length ? '모두 넣음' : done + '장 넣음'}` : ''}</small></span>
        <span class="th">${list.slice(0, 4).map((_, i) => `<img alt="" data-d="${d}" data-i="${i}">`).join('')}</span>
      </button>`;
    }).join('') + (days.length > shown ? `<button class="chip" id="more" style="margin:10px auto;display:block">이전 날짜 더 보기</button>` : '');
    loadThumbs();
    const more = $('#more', sh); if (more) more.onclick = () => { shown += 60; draw(); };
  };
  const update = () => {
    const n = [...sel].reduce((s, d) => s + byDay.get(d).filter(it => !have.has(it.name)).length, 0);
    go.disabled = !sel.size;
    go.textContent = sel.size ? (n ? `${sel.size}일 · 사진 ${n}장 넣기` : '이미 다 넣은 날이에요') : '날짜를 골라주세요';
    if (sel.size && !n) go.disabled = true;
  };
  let io = null;
  function loadThumbs() {
    if (io) io.disconnect();
    io = new IntersectionObserver(es => es.forEach(async e => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const img = e.target; const it = byDay.get(img.dataset.d)[+img.dataset.i];
      if (VID.test(it.name)) { img.classList.add('is-vid'); return; }
      try { const f = await getFile(it); img.src = URL.createObjectURL(f); img.onload = () => URL.revokeObjectURL(img.src); } catch { }
    }), { root: sh, rootMargin: '300px' });
    box.querySelectorAll('img[data-d]').forEach(i => io.observe(i));
  }
  box.addEventListener('click', e => {
    const r = e.target.closest('.day-row'); if (!r) return;
    const d = r.dataset.d; sel.has(d) ? sel.delete(d) : sel.add(d);
    r.classList.toggle('on', sel.has(d)); r.setAttribute('aria-pressed', sel.has(d)); update();
  });
  go.addEventListener('click', async () => {
    const pick = [...sel].flatMap(d => byDay.get(d)).filter(it => !have.has(it.name));
    go.disabled = true; go.textContent = '준비 중…';
    const files = [];
    for (const it of pick) { try { const f = await getFile(it); if (it.handle) f._handle = it.handle; files.push(f); } catch { } }
    App.closeSheet(true);
    Actions.importFiles(files);
  });
  draw(); update();
}

const fromFiles = files => scanItems([...files].filter(f => IMG.test(f.name)).map(f => ({ name: f.name, file: f, day: dayFromName(f.name) })));
window.Folder = { start, fromFiles, dayFromName, hasDirPicker, hasDirInput };
})();
