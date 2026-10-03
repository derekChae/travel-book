// 나의 여행책 — 화면 (책장 / 한 권 읽기·편집 / 책 PDF)
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const S = { trips: [], photos: [], urls: new Map() };
const view = () => $('#view');

// ---------- 날짜 ----------
const dayKey = p => (p.taken ? p.taken.slice(0, 10) : p.assignedDate || null);
function ymd(d) { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, wd: WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] }; }
const fmtFull = d => { const x = ymd(d); return `${x.y}년 ${x.m}월 ${x.d}일 (${x.wd})`; };
const fmtTime = p => p.taken ? p.taken.slice(11, 16) : '';
const fmtRange = (a, b) => Render.range(a, b) || '날짜 모름';
const placeText = p => p.place && p.place.name ? p.place.name + (p.place.near ? ' 근처' : '') : '';

// ---------- 여행 정보 ----------
function tripPhotos(id) { return Meta.sortPhotos(S.photos.filter(p => p.tripId === id)); }
function tripInfo(t) {
  const ps = tripPhotos(t.id);
  const days = [...new Set(ps.map(dayKey).filter(Boolean))].sort();
  const counts = {};
  ps.forEach(p => { const n = p.place && p.place.name; if (n) counts[n] = (counts[n] || 0) + 1; });
  const places = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const countries = [...new Set(ps.map(p => p.place && p.place.country).filter(Boolean))];
  let title = t.title;
  if (!title) {
    if (places.length) title = places[0] + ' 여행';
    else if (days.length) { const x = ymd(days[0]); title = `${x.y}년 ${x.m}월의 여행`; }
    else title = '이름 없는 여행';
  }
  return { ps, days, start: days[0] || null, end: days[days.length - 1] || null, places, countries, title };
}
function orderedTrips() {
  return S.trips.map(t => ({ t, i: tripInfo(t) })).filter(x => x.i.ps.length || !x.t.undatedBin)
    .sort((a, b) => (a.i.start || '9999').localeCompare(b.i.start || '9999'));
}
function issueNo(id) { const o = orderedTrips(); return String(o.findIndex(x => x.t.id === id) + 1).padStart(2, '0'); }

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
// 한 권 계획 + 그리기 준비
function bookCtx(t, { edit = false, img } = {}) {
  const info = tripInfo(t);
  const plan = Pages.plan(t, info.ps);
  const map = new Map(info.ps.map(p => [p.id, p]));
  const ctx = {
    trip: t, edit, issueNo: issueNo(t.id),
    info: { title: info.title, start: info.start, end: info.end, places: info.places, countries: info.countries, count: plan.shown.length },
    photo: id => map.get(id),
    img: img || (p => `data-key="${p.id}:disp" src="${BLANK}"`),
    dayPlaces: d => [...new Set(info.ps.filter(p => dayKey(p) === d).map(p => p.place && p.place.name).filter(Boolean))],
  };
  return { info, plan, ctx };
}

// ---------- 사진 불러오기 (보이는 것부터) ----------
async function urlFor(key) {
  if (S.urls.has(key)) return S.urls.get(key);
  let b = await DB.getBlob(key);
  if (!b && key.endsWith(':video')) {
    // 원본을 가리키는 영상: 권한이 있으면 폰 갤러리의 파일을 바로 엶
    const h = await DB.getBlob(key.replace(':video', ':vhandle'));
    if (h && h.getFile) {
      try { let perm = h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted'; if (perm !== 'granted' && App.askPermission && h.requestPermission) perm = await h.requestPermission({ mode: 'read' }); if (perm === 'granted') b = await h.getFile(); } catch { }
    }
    if (!b) return '';
  }
  if (!b && key.endsWith(':print')) b = (await DB.getBlob(key.replace(':print', ':orig'))) || (await DB.getBlob(key.replace(':print', ':disp')));
  if (!b && key.endsWith(':disp')) b = await DB.getBlob(key.replace(':disp', ':thumb'));
  if (!b) return '';
  const u = URL.createObjectURL(b); S.urls.set(key, u); return u;
}
let io = null;
function hydrate(root = document) {
  if (io) io.disconnect();
  io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { io.unobserve(e.target); loadImg(e.target); }
  }), { rootMargin: '1200px 0px' }) : null;
  root.querySelectorAll('img[data-key]').forEach(img => io ? io.observe(img) : loadImg(img));
}
async function loadImg(img) { const u = await urlFor(img.dataset.key); if (u) img.src = u; }
async function hydrateAll(root) {
  const imgs = [...root.querySelectorAll('img[data-key]')];
  await Promise.all(imgs.map(async img => { await loadImg(img); try { await img.decode(); } catch { } }));
}
const imgTag = (p, kind) => `<img data-key="${p.id}:${kind}" src="${BLANK}" alt="">`;

function dockHtml(inTrip) {
  const folderOk = ('showDirectoryPicker' in window || 'webkitdirectory' in document.createElement('input')) && !/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (inTrip) return `<div class="dock dock-3"><button class="btn-sub" data-act="add">+ 사진</button><button class="btn-main" data-act="voice"><span class="mic-ico" aria-hidden="true"></span>말로 남기기</button><button class="btn-sub" data-act="ai">AI로 글쓰기</button></div>`;
  return `<nav class="fdock" aria-label="사진 넣기"><button class="fd-main" data-act="add"><span class="fi fi-plus" aria-hidden="true"></span>${folderOk ? '날짜로 사진 넣기' : '사진 넣기'}</button>${folderOk ? '<button data-act="pick-files-direct">직접 고르기</button>' : ''}</nav>`;
}

// ---------- 책장 ----------
let introPlayed = false;
const split = (w, start) => [...w].map((c, i) => `<span class="ch" style="--d:${start + i}">${esc(c)}</span>`).join('');
function renderHome({ quiet = false } = {}) {
  document.title = '나의 여행책';
  document.body.className = 'is-home';
  const list = orderedTrips();
  const mode = localStorage.getItem('shelfMode') === 'index' ? 'index' : 'stack';
  const q = quiet || introPlayed; introPlayed = true;
  const coverOf = (t, i) => Pages.plan(t, i.ps).cover;
  let html = `<div class="shelf-root${q ? ' quiet' : ''}">
    <header class="top" id="top"><div class="brand">나의 여행책</div><div style="flex:1"></div>
      ${list.length ? `<div class="shelf-mode"><button data-shelf="stack" aria-pressed="${mode === 'stack'}">크게</button><button data-shelf="index" aria-pressed="${mode === 'index'}">목록</button></div>
      <button class="icon-btn" data-act="home-menu">더보기</button>` : ''}</header>
    <section class="sh-intro"><div class="sh-count">${list.length ? `여행 ${list.length}권 · 사진 ${S.photos.filter(p => p.kind !== 'video').length}장${S.photos.some(p => p.kind === 'video') ? ` · 영상 ${S.photos.filter(p => p.kind === 'video').length}개` : ''}` : '처음 오셨네요'}</div>
      <h1 class="sh-title"><span class="ln">${split('나의', 0)}</span><span class="ln">${split('여행책', 2)}</span></h1></section>`;
  if (list.length) {
    const nowM = App.today ? App.today() : new Date(); const mdM = `${String(nowM.getMonth() + 1).padStart(2, '0')}-${String(nowM.getDate()).padStart(2, '0')}`;
    const memT = list.map(({ t, i }) => ({ t, i, d: i.days.find(x => x.slice(5) === mdM && +x.slice(0, 4) < nowM.getFullYear()) })).filter(x => x.d).pop();
    if (memT) { const c = coverOf(memT.t, memT.i); html += `<section class="sh-mem-wrap"><button class="sh-mem" data-go="#/trip/${memT.t.id}" data-trip-go="${memT.t.id}">${c ? `<img data-key="${c.id}:thumb" src="${BLANK}" alt="">` : ''}<span><b>${nowM.getFullYear() - +memT.d.slice(0, 4)}년 전 오늘</b>${esc(memT.i.title)}</span></button></section>`; }
  }
  // N년 전 오늘
  const now = App.today ? App.today() : new Date(); const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const agoOf = i => { const d = i.days.find(x => x.slice(5) === md && +x.slice(0, 4) < now.getFullYear()); return d ? now.getFullYear() - +d.slice(0, 4) : 0; };
  const items = list.map(({ t, i }, k) => ({ t, i, no: String(k + 1).padStart(2, '0'), c: coverOf(t, i), ago: agoOf(i) })).reverse();
  const mem = items.find(x => x.ago);
  if (!list.length) {
    html += `<p class="sh-empty">여행 간 날짜만 고르면, 표지부터 사진이 화면 가득 채워진 여행책이 만들어져요.</p>`;
  } else if (mode === 'stack') {
    html += `<div class="stack">${items.map(({ t, i, no, c, ago }, j) => `
      <button class="card" style="--j:${j}" data-go="#/trip/${t.id}" data-trip-go="${t.id}" aria-label="${esc(i.title)} 열기">
        <div class="card-in">
          ${c ? `<img class="card-img" data-key="${c.id}:disp" src="${S.urls.get(c.id + ':disp') || BLANK}" alt="" style="${c.focus ? `object-position:${c.focus.x}% ${c.focus.y}%` : ''}">` : '<div class="card-empty">사진 없음</div>'}
          <div class="card-tx"><div class="card-no">No.${no}${ago ? ` · ${ago}년 전 오늘` : ''}${t.published ? ' · 발행됨' : ''}</div>
            <h2 class="card-t">${esc(i.title)}</h2>
            <div class="card-m">${fmtRange(i.start, i.end)} · ${i.ps.some(p => p.kind === 'video') ? `사진 ${i.ps.filter(p => p.kind !== 'video').length} · 영상 ${i.ps.filter(p => p.kind === 'video').length}` : `사진 ${i.ps.length}장`}${i.places.length ? ' · ' + esc(i.places.slice(0, 2).join(' · ')) : ''}</div></div>
        </div></button>`).join('')}</div>`;
  } else {
    html += `<ol class="ix">${items.map(({ t, i, no, c }, j) => `<li style="--j:${j}">
      <button class="ix-row" data-go="#/trip/${t.id}" data-trip-go="${t.id}" ${c ? `data-cover="${c.id}:disp"` : ''}>
        <span class="ix-no">${no}</span>
        <span class="ix-main"><span class="ix-t">${esc(i.title)}</span><span class="ix-d">${fmtRange(i.start, i.end)} · ${i.ps.length}장</span></span>
        <span class="ix-th">${c ? `<img data-key="${c.id}:thumb" src="${BLANK}" alt="">` : ''}</span>
      </button></li>`).join('')}</ol><div class="ix-float" aria-hidden="true"><img alt="" src="${BLANK}"></div>`;
  }
  html += `<div class="page-bottom-space"></div>${dockHtml(false)}</div>`;
  view().innerHTML = html;
  hydrate(view());
  if (window.Shelf) Shelf.mount(view(), { quiet: q });
}

// ---------- 화면 이동 (표지가 커지며 열리는 전환) ----------
let rendered = null, homeY = 0;
function go(hash, el) {
  const nav = () => { location.hash = hash; if (location.hash !== rendered) route(); };
  const toTrip = (hash.match(/^#\/trip\/(.+)$/) || [])[1];
  const fromTrip = (location.hash.match(/^#\/trip\/(.+)$/) || [])[1];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let src = null;
  if (toTrip && document.body.classList.contains('is-home') && el) src = el.querySelector('img');
  else if (fromTrip && hash === '#/' && window.scrollY < innerHeight * 0.6) src = document.querySelector('.st-cover-img');
  if (!document.startViewTransition || reduce || !src || !src.src || src.src.startsWith('data:')) { nav(); return; }
  src.style.viewTransitionName = 'hero-cover';
  document.documentElement.classList.add(toTrip ? 'vt-open' : 'vt-close');
  const vt = document.startViewTransition(async () => {
    nav();
    let dst = toTrip ? document.querySelector('.st-cover-img') : document.querySelector(`[data-trip-go="${fromTrip}"] img`);
    if (!dst) return;
    const key = dst.dataset.key || ''; const id = key.split(':')[0];
    const cached = S.urls.get(id + ':print') || S.urls.get(id + ':disp');
    if (cached && (!dst.src || dst.src.startsWith('data:'))) dst.src = cached;
    dst.style.viewTransitionName = 'hero-cover';
    await Promise.race([dst.decode().catch(() => { }), new Promise(r => setTimeout(r, 300))]);
  });
  vt.finished.finally(() => {
    document.querySelectorAll('[style*="view-transition-name"]').forEach(x => { x.style.viewTransitionName = ''; });
    document.documentElement.classList.remove('vt-open', 'vt-close');
  });
}

// ---------- 한 권 ----------
function renderTrip(id) {
  const t = S.trips.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  document.body.className = 'is-book';
  const { info, plan, ctx } = bookCtx(t, { edit: true });
  document.title = info.title + ' · 나의 여행책';
  const hidden = plan.hiddenBy.size;
  view().innerHTML = `<header class="top" id="top"><button class="back" data-go="#/trip/${t.id}">‹ 이야기로</button>
      <div class="top-title">책 모양 (인쇄용)</div>
      <button class="icon-btn" data-act="print-trip">PDF</button></header>
    <div class="book-note">인쇄했을 때의 페이지 모양이에요.${hidden ? ` 비슷한 사진 ${hidden}장은 대표 한 장만 넣었어요.` : ''}</div>
    <article class="bk" data-trip="${t.id}">${Render.screenHTML(plan, ctx)}</article>
    <div class="page-bottom-space"></div>${dockHtml(true)}`;
  hydrate(view());
}


// ---------- 이야기 화면 (사진 위주) ----------
function storyCtx(t, { edit = false, img } = {}) {
  const { info, plan, ctx } = bookCtx(t, { edit });
  return { info, plan, sctx: { ...ctx, info: ctx.info, trip: t, edit, shown: plan.shown, cover: plan.cover,
    img: img || ((p, role) => `data-key="${p.id}:${role === 'hero' ? 'print' : role === 'thumb' ? 'thumb' : 'disp'}" src="${BLANK}"`) } };
}
function renderStory(id) {
  const t = S.trips.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  document.body.className = 'is-story';
  const { info, sctx } = storyCtx(t, { edit: true });
  document.title = info.title + ' · 나의 여행책';
  view().innerHTML = `<header class="top on-cover" id="top"><button class="back" data-go="#/">‹ 책장</button>
      <div class="top-title">${esc(info.title)}</div>
      ${info.ps.some(p => p.kind === 'video') ? '<button class="icon-btn ib-snd" data-act="amb" aria-pressed="false" aria-label="현장음"></button>' : ''}<button class="icon-btn" data-act="trip-more">편집</button></header>
    <div data-trip="${t.id}">${Story.storyHTML(sctx)}</div>
    ${storyDock()}`;
  hydrate(view());
  onScrollTop();
  if (window.Motion) Motion.mount(view().querySelector('.st'), { trip: t });
}
function storyDock() {
  return `<nav class="fdock" aria-label="기록 도구"><button data-act="add"><span class="fi fi-plus" aria-hidden="true"></span>사진</button><button class="fd-main" data-act="voice"><span class="fi fi-mic" aria-hidden="true"></span>말로 남기기</button><button data-act="ai">AI 글쓰기</button></nav>`;
}
let lastY = 0;
function onScrollTop() {
  const t = $('#top'); if (!t) return;
  const y = window.scrollY;
  t.classList.toggle('scrolled', y > 4);
  if (document.body.classList.contains('is-home')) t.classList.toggle('show-brand', y > 200);
  const story = document.body.classList.contains('is-story'), home = document.body.classList.contains('is-home');
  if (story || home) {
    const onCover = story ? y < window.innerHeight - 80 : y < 200;
    if (story) t.classList.toggle('on-cover', onCover);
    // 사진 볼 때는 위아래 막대를 숨기고, 위로 올리거나 끝에 닿으면 다시 보여줌
    const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 40;
    if (onCover || atEnd || y < lastY - 6) document.body.classList.remove('chrome-hidden');
    else if (y > lastY + 6) document.body.classList.add('chrome-hidden');
  }
  lastY = y;
}

// ---------- 책 PDF ----------
async function renderPrint(which) {
  const list = which === 'all' ? orderedTrips().map(x => x.t) : S.trips.filter(t => t.id === which);
  if (!list.length) { location.hash = '#/'; return; }
  document.body.className = 'is-print';
  view().innerHTML = `<header class="top no-print"><button class="back" data-go="${which === 'all' ? '#/' : '#/trip/' + which}">‹ 돌아가기</button>
      <button class="icon-btn" data-act="do-print">PDF로 저장</button></header>
    <div class="no-print tip print-tip">사진을 불러오는 중이에요… 준비되면 인쇄 창이 열려요.</div>
    <div class="bk bk-print">${list.map(t => { const { plan, ctx } = bookCtx(t, { img: p => `data-key="${p.id}:print" src="${BLANK}"` }); return Render.printHTML(plan, ctx); }).join('')}</div>`;
  await hydrateAll(view());
  const tip = $('.print-tip', view()); if (tip) tip.innerHTML = '준비됐어요. 인쇄 창에서 <b>PDF로 저장</b>을 고르고 <b>배경 그래픽</b>을 켜 주세요. 창이 안 뜨면 위의 <b>PDF로 저장</b>을 눌러요.';
  setTimeout(() => window.print(), 300);
}

// ---------- 길찾기 ----------
function route() {
  const h = location.hash || '#/';
  if (document.body.classList.contains('is-home')) homeY = window.scrollY;
  rendered = location.hash;
  if (window.Shelf) Shelf.off();
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) { window.scrollTo(0, 0); renderStory(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/book\/(.+)$/))) { window.scrollTo(0, 0); renderTrip(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/print\/(.+)$/))) { window.scrollTo(0, 0); renderPrint(decodeURIComponent(m[1])); }
  else { renderHome(); window.scrollTo(0, homeY); }
}
function rerender() {
  const y = window.scrollY; const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) renderStory(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/book\/(.+)$/))) renderTrip(decodeURIComponent(m[1]));
  else if (!h.startsWith('#/print')) renderHome({ quiet: true });
  window.scrollTo(0, y);
}
window.addEventListener('hashchange', () => { if (location.hash !== rendered) route(); });
window.addEventListener('scroll', onScrollTop, { passive: true });

function toast(msg, ms = 2600, action) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.remove(); action.run(); };
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

window.App = { today: null, go, renderHome, storyCtx, S, $, esc, uid, dayKey, fmtFull, fmtTime, fmtRange, placeText, tripInfo, tripPhotos, orderedTrips, issueNo, bookCtx, rerender, route, toast, urlFor, imgTag, BLANK };
