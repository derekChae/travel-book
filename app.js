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
async function loadImg(img) { const u = await urlFor(img.dataset.key); if (u) img.src = u; upgradeToOriginal(img); }
// 원본 화질: 원본이 연결된 사진은 크게 보일 때 원본 파일을 그대로 띄움 (복사하지 않음, HDR·색도 원본 그대로)
async function originalURL(id, ask) {
  const key = id + ':origfile'; if (S.urls.has(key)) return S.urls.get(key);
  const h = await DB.getBlob(id + ':ohandle'); if (!h || !h.getFile) return '';
  try {
    let perm = h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted';
    if (perm !== 'granted' && ask && h.requestPermission) perm = await h.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return '';
    const f = await h.getFile(); const u = URL.createObjectURL(f); S.urls.set(key, u); return u;
  } catch { return ''; }
}
// 화면에 필요한 만큼만: 2048 사본으로 모자랄 때만 4096 사본, 그것도 모자랄 때(5K 화면 등)만 원본
async function upgradeToOriginal(img) {
  const [id, kind] = (img.dataset.key || '').split(':');
  if (kind !== 'disp' || img.dataset.up) return;
  const p = S.photos.find(x => x.id === id); if (!p || p.kind === 'video') return;
  const r = img.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // 화면을 채우는 사진은 잘리는 만큼 더 큰 해상도가 필요
  const cover = p.w && p.h && r.height ? Math.max(r.width, r.height * p.w / p.h) : r.width;
  const need = cover * dpr;
  if (need <= 2048 * 1.1) return;
  img.dataset.up = '1';
  let u = need > 4096 * 1.1 && p.origRef ? await originalURL(id, false) : '';
  if (!u) u = await urlFor(id + ':print');
  if (!u || u === img.src) return;
  const pre = new Image(); pre.decoding = 'async'; pre.src = u;
  try { await pre.decode(); } catch { return; }
  if (img.isConnected) img.src = u;
}
async function hydrateAll(root) {
  const imgs = [...root.querySelectorAll('img[data-key]')];
  await Promise.all(imgs.map(async img => { await loadImg(img); try { await img.decode(); } catch { } }));
}
const imgTag = (p, kind) => `<img data-key="${p.id}:${kind}" src="${BLANK}" alt="">`;

function dockHtml(inTrip) {
  const folderOk = ('showDirectoryPicker' in window || 'webkitdirectory' in document.createElement('input')) && !/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (inTrip) return `<div class="dock dock-3"><button class="btn-sub" data-act="add">+ 사진</button><button class="btn-main" data-act="voice"><span class="mic-ico" aria-hidden="true"></span>말로 남기기</button><button class="btn-sub" data-act="ai">AI로 글쓰기</button></div>`;
  return `<nav class="fdock" aria-label="사진 넣기"><button class="fd-main" data-act="add"><span class="fi fi-plus" aria-hidden="true"></span>${S.demo ? '내 사진으로 시작하기' : '사진 넣기'}</button></nav>`;
}

// ---------- 책장 ----------
let introPlayed = false;
const split = (w, start) => [...w].map((c, i) => `<span class="ch" style="--d:${start + i}">${esc(c)}</span>`).join('');
// 여행이 속한 나라 (사진에 가장 많이 나온 나라)
const NOCOUNTRY = '나라 미정';
function countryOf(i) {
  const c = {}; i.ps.forEach(p => { const n = p.place && p.place.country; if (n) c[n] = (c[n] || 0) + 1; });
  const k = Object.keys(c).sort((a, b) => c[b] - c[a]); return k[0] || NOCOUNTRY;
}
function shelfView() {
  const v = localStorage.getItem('shelfView');
  return v === 'swipe' || v === 'grid' ? v : (matchMedia('(max-width: 760px)').matches ? 'swipe' : 'grid');
}
function renderHome({ quiet = false, folder = null } = {}) {
  document.title = folder ? folder + ' · 나의 여행책' : '나의 여행책';
  document.body.className = folder ? 'is-home is-folder' : 'is-home';
  const all = orderedTrips();
  const q = quiet || introPlayed; introPlayed = true;
  const coverOf = (t, i) => Pages.plan(t, i.ps).cover;
  const now = App.today ? App.today() : new Date(); const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const agoOf = i => { const d = i.days.find(x => x.slice(5) === md && +x.slice(0, 4) < now.getFullYear()); return d ? now.getFullYear() - +d.slice(0, 4) : 0; };
  const nPh = ps => ps.filter(p => p.kind !== 'video').length, nV = ps => ps.filter(p => p.kind === 'video').length;
  if (folder) {
    const list = all.map((x, k) => ({ ...x, k })).filter(x => countryOf(x.i) === folder);
    if (!list.length) { location.hash = '#/'; return; }
    const mode = shelfView();
    const items = list.map(({ t, i, k }) => ({ t, i, no: String(k + 1).padStart(2, '0'), c: coverOf(t, i), ago: agoOf(i) })).reverse();
    const ps = list.flatMap(x => x.i.ps); const years = [...new Set(list.map(x => x.i.start && x.i.start.slice(0, 4)).filter(Boolean))].sort();
    let html = `<div class="shelf-root quiet">
      <header class="top" id="top"><button class="back" data-go="#/">‹ 책장</button><div class="top-title fd-tt">${esc(folder)}</div>
        <div class="shelf-mode"><button data-shelf="swipe" aria-pressed="${mode === 'swipe'}">가로보기</button><button data-shelf="grid" aria-pressed="${mode === 'grid'}">격자보기</button></div></header>
      <section class="fd-head"><h1>${esc(folder)}</h1><span>여행 ${list.length}권 · 사진 ${nPh(ps)}장${nV(ps) ? ` · 영상 ${nV(ps)}개` : ''}${years.length ? ' · ' + (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0]) : ''}</span></section>`;
    if (mode !== 'index') {
      const phone = mode;
    // 표지 카드: 여행마다 고른 글꼴로 제목, 아래에 소개 글과 화면 가득 사진
    const sizeOf = i => i.ps.some(p => p.kind === 'video') ? `사진 ${i.ps.filter(p => p.kind !== 'video').length} · 영상 ${i.ps.filter(p => p.kind === 'video').length}` : `사진 ${i.ps.length}장`;
      html += `<div class="bc-row bc-${phone}">${items.map(({ t, i, no, c, ago }, j) => {
      const font = (t.style || {}).font || 'maru'; ensureFont(font);
      const heroes = Pages.plan(t, i.ps).shown.filter(p => Story.isHero(p) && (!c || p.id !== c.id)).slice(0, 3);
      return `<button class="bc" style="--j:${j}" data-go="#/trip/${t.id}" data-trip-go="${t.id}" aria-label="${esc(i.title)} 열기">
        <span class="bc-cover fv" data-font="${font}">${c ? `<img class="card-img" data-key="${c.id}:disp" src="${S.urls.get(c.id + ':disp') || BLANK}" alt="" style="${c.focus ? `object-position:${c.focus.x}% ${c.focus.y}%` : ''}">` : '<span class="card-empty">사진 없음</span>'}
          <span class="bc-no">No.${no}</span>${ago ? `<span class="bc-ago">${ago}년 전 오늘</span>` : ''}
          <span class="bc-ct"><span class="bc-k">${esc([i.countries.join(' · '), i.places.slice(0, 2).join(' · ')].filter(Boolean).join(' · '))}</span><span class="pk-t bc-t">${esc(i.title)}</span></span></span>
        <span class="bc-body"><span class="bc-m">${fmtRange(i.start, i.end)} · ${sizeOf(i)}${t.published ? ' · 발행됨' : ''}</span>
          ${t.lede ? `<span class="bc-lede">${esc(t.lede)}</span>` : ''}</span>
      </button>`; }).join('')}</div>`;
    } else {
    html += `<ol class="ix">${items.map(({ t, i, no, c }, j) => `<li style="--j:${j}">
      <button class="ix-row" data-go="#/trip/${t.id}" data-trip-go="${t.id}" ${c ? `data-cover="${c.id}:disp"` : ''}>
        <span class="ix-no">${no}</span>
        <span class="ix-main"><span class="ix-t">${esc(i.title)}</span><span class="ix-d">${fmtRange(i.start, i.end)} · ${i.ps.length}장</span></span>
        <span class="ix-th">${c ? `<img data-key="${c.id}:thumb" src="${BLANK}" alt="">` : ''}</span>
      </button></li>`).join('')}</ol><div class="ix-float" aria-hidden="true"><img alt="" src="${BLANK}"></div>`;
    }
    html += `<div class="fd-end"></div></div>`;
    view().innerHTML = html;
    hydrate(view());
    if (window.Shelf) Shelf.mount(view(), { quiet: true });
    return;
  }
  // 첫 화면: 나라별 폴더
  let html = `<div class="shelf-root${q ? ' quiet' : ''}">
    <header class="top" id="top"><div class="brand">나의 여행책</div><div style="flex:1"></div>
      ${all.length ? '<button class="pp-btn" data-go="#/passport"><span class="pp-ico" aria-hidden="true"></span>여권</button>' + (S.demo ? '' : '<button class="icon-btn" data-act="home-menu">더보기</button>') : ''}</header>
    <section class="sh-intro"><div class="sh-count">${all.length ? `여행 ${all.length}권 · 사진 ${nPh(S.photos)}장${nV(S.photos) ? ` · 영상 ${nV(S.photos)}개` : ''}` : '처음 오셨네요'}</div>
      <h1 class="sh-title"><span class="ln">${split('나의', 0)}</span><span class="ln">${split('여행책', 2)}</span></h1>
      ${S.demo ? '<p class="demo-note">예시 여행책이에요. 둘러보다가 <b>내 사진으로 시작하기</b>를 누르면 예시는 사라지고 내 여행책이 만들어져요.</p>' : ''}</section>`;
  if (all.length) {
    const memT = all.map(({ t, i }) => ({ t, i, d: i.days.find(x => x.slice(5) === md && +x.slice(0, 4) < now.getFullYear()) })).filter(x => x.d).pop();
    if (memT) { const c = coverOf(memT.t, memT.i); html += `<section class="sh-mem-wrap"><button class="sh-mem" data-go="#/trip/${memT.t.id}" data-trip-go="${memT.t.id}">${c ? `<img data-key="${c.id}:thumb" src="${BLANK}" alt="">` : ''}<span><b>${now.getFullYear() - +memT.d.slice(0, 4)}년 전 오늘</b>${esc(memT.i.title)}</span></button></section>`; }
    const groups = new Map();
    all.forEach(x => { const k = countryOf(x.i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    // 최근 여행이 있는 나라부터, 나라 미정은 맨 뒤
    const keys = [...groups.keys()].sort((a, b) => a === NOCOUNTRY ? 1 : b === NOCOUNTRY ? -1 : (groups.get(b).at(-1).i.start || '').localeCompare(groups.get(a).at(-1).i.start || ''));
    html += `<div class="cf-row">${keys.map((k, j) => {
      const g = groups.get(k); const ps = g.flatMap(x => x.i.ps);
      const covers = g.slice().reverse().map(x => coverOf(x.t, x.i)).filter(Boolean).slice(0, 3);
      const years = [...new Set(g.map(x => x.i.start && x.i.start.slice(0, 4)).filter(Boolean))].sort();
      const places = []; g.slice().reverse().forEach(x => x.i.places.forEach(p => { if (!places.includes(p)) places.push(p); }));
      const img = (c, cls) => `<img class="${cls}" data-key="${c.id}:disp" src="${S.urls.get(c.id + ':disp') || BLANK}" alt="" style="${c.focus ? `object-position:${c.focus.x}% ${c.focus.y}%` : ''}">`;
      return `<button class="cf" style="--j:${j}" data-go="#/c/${encodeURIComponent(k)}" aria-label="${esc(k)} 폴더 열기">
        <span class="cf-stack">${covers[2] ? img(covers[2], 'cf-b2') : '<span class="cf-b2 cf-blank"></span>'}${covers[1] ? img(covers[1], 'cf-b1') : '<span class="cf-b1 cf-blank"></span>'}${covers[0] ? img(covers[0], 'cf-main') : '<span class="cf-main cf-blank"></span>'}<span class="cf-cnt">${g.length}권</span></span>
        <span class="cf-tx"><span class="cf-n">${esc(k)}</span><span class="cf-m">${years.length ? (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0]) + ' · ' : ''}사진 ${nPh(ps)}장</span>${places.length ? `<span class="cf-pl">${esc(places.slice(0, 4).join(' · '))}</span>` : ''}</span>
      </button>`; }).join('')}</div>`;
  } else {
    html += `<p class="sh-empty">여행 간 날짜만 고르면, 표지부터 사진이 화면 가득 채워진 여행책이 만들어져요.</p>`;
  }
  html += `<div class="page-bottom-space"></div>${dockHtml(false)}</div>`;
  view().innerHTML = html;
  hydrate(view());
  if (window.Shelf) Shelf.mount(view(), { quiet: q });
}

// ---------- 화면 이동 (표지가 커지며 열리는 전환) ----------
let rendered = null, homeY = 0; const folderY = new Map();
function go(hash, el) {
  const nav = () => { location.hash = hash; if (location.hash !== rendered) route(); };
  const toTrip = (hash.match(/^#\/trip\/(.+)$/) || [])[1];
  const fromTrip = (location.hash.match(/^#\/trip\/(.+)$/) || [])[1];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let src = null;
  if (toTrip && document.body.classList.contains('is-home') && el) src = el.querySelector('img');
  else if (fromTrip && /^#\/(c\/.*)?$/.test(hash) && window.scrollY < innerHeight * 0.6) src = document.querySelector('.st-cover-img');
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



// ---------- 글꼴 (여행마다 고름, 매거진 레이아웃은 그대로) ----------
const FONTS = {
  maru: { name: '마루부리', note: '차분한 명조 · 기본', css: [] },
  hahmlet: { name: '함렛 + SUIT', note: '굵은 명조 제목, 잡지 표지 느낌', css: ['https://fonts.googleapis.com/css2?family=Hahmlet:wght@400;700;800&display=swap'] },
  song: { name: '송명 + 고운바탕', note: '붓맛 제목, 여행 에세이 느낌', css: ['https://fonts.googleapis.com/css2?family=Song+Myung&family=Gowun+Batang:wght@400;700&display=swap'] },
  suit: { name: 'SUIT', note: '깔끔한 고딕, 사진이 더 돋보여요', css: [] },
  wanted: { name: '원티드 산스 + 마루부리', note: '요즘 고딕 제목, 명조 본문', css: ['https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css'] },
};
function ensureFont(key) {
  (FONTS[key] || FONTS.maru).css.forEach(href => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } });
}

// ---------- 이야기 화면 (사진 위주) ----------
function storyCtx(t, { edit = false, img } = {}) {
  const { info, plan, ctx } = bookCtx(t, { edit });
  return { info, plan, sctx: { ...ctx, info: ctx.info, trip: t, edit, shown: plan.shown, cover: plan.cover,
    img: img || ((p, role) => `data-key="${p.id}:${role === 'thumb' ? 'thumb' : 'disp'}" src="${BLANK}" decoding="async"`) } };
}
function renderStory(id) {
  const t = S.trips.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  document.body.className = 'is-story';
  ensureFont((t.style || {}).font);
  const { info, sctx } = storyCtx(t, { edit: !S.demo });
  document.title = info.title + ' · 나의 여행책';
  view().innerHTML = `<header class="top on-cover" id="top"><button class="back" data-go="#/c/${encodeURIComponent(countryOf(info))}">‹ ${esc(countryOf(info))}</button>
      <div class="top-title">${esc(info.title)}</div>
      ${info.ps.some(p => p.kind === 'video') ? '<button class="icon-btn ib-snd" data-act="amb" aria-pressed="false" aria-label="현장음"></button>' : ''}${S.demo ? '<span class="demo-tag">예시</span>' : '<button class="icon-btn" data-act="trip-more">편집</button>'}</header>
    <div data-trip="${t.id}">${Story.storyHTML(sctx)}</div>
    ${S.demo ? demoDock() : storyDock()}`;
  hydrate(view());
  onScrollTop();
  if (window.Motion) Motion.mount(view().querySelector('.st'), { trip: t });
}
function demoDock() {
  return `<nav class="fdock" aria-label="사진 넣기"><button class="fd-main" data-act="add"><span class="fi fi-plus" aria-hidden="true"></span>내 사진으로 시작하기</button></nav>`;
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
  if (document.body.classList.contains('is-folder')) folderY.set(decodeURIComponent((rendered || '').replace(/^#\/c\//, '')), window.scrollY);
  else if (document.body.classList.contains('is-home')) homeY = window.scrollY;
  rendered = location.hash;
  if (window.Shelf) Shelf.off();
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) { window.scrollTo(0, 0); renderStory(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/book\/(.+)$/))) { window.scrollTo(0, 0); renderTrip(decodeURIComponent(m[1])); }
  else if ((m = h.match(/^#\/print\/(.+)$/))) { window.scrollTo(0, 0); renderPrint(decodeURIComponent(m[1])); }
  else if (h === '#/passport') { window.scrollTo(0, 0); Passport.render(); }
  else if ((m = h.match(/^#\/c\/(.+)$/))) { const f = decodeURIComponent(m[1]); const y = folderY.get(f) || 0; renderHome({ folder: f }); window.scrollTo(0, y); }
  else { renderHome(); window.scrollTo(0, homeY); }
}
function rerender() {
  const y = window.scrollY; const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) renderStory(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/book\/(.+)$/))) renderTrip(decodeURIComponent(m[1]));
  else if (h === '#/passport') Passport.render();
  else if ((m = h.match(/^#\/c\/(.+)$/))) renderHome({ quiet: true, folder: decodeURIComponent(m[1]) });
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

window.App = { countryOf, hydrateView: hydrate, originalURL, upgradeToOriginal, FONTS, ensureFont, today: null, go, renderHome, storyCtx, S, $, esc, uid, dayKey, fmtFull, fmtTime, fmtRange, placeText, tripInfo, tripPhotos, orderedTrips, issueNo, bookCtx, rerender, route, toast, urlFor, imgTag, BLANK };
