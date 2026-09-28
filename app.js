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
  return `<div class="dock"><button class="btn-main" data-act="add"><span class="plus">+</span> ${folderOk ? '날짜로 사진 넣기' : '사진 넣기'}</button>${folderOk ? '<button class="btn-sub" data-act="pick-files-direct">직접 고르기</button>' : ''}</div>`;
}

// ---------- 책장 ----------
function renderHome() {
  document.title = '나의 여행책';
  document.body.className = 'is-home';
  const list = orderedTrips();
  let html = `<header class="top" id="top"><div class="brand">나의 여행책</div>
    ${list.length ? `<button class="icon-btn" data-act="home-menu">더보기</button>` : ''}</header>`;
  if (!list.length) {
    html += `<section class="welcome">
      <h1>찍은 사진으로<br>나만의 여행책을</h1>
      <p>여행 간 날짜만 고르면, 찍은 시각과 장소로 페이지가 알아서 짜여요. 글은 AI에게 초안을 부탁하고 눌러서 고치면 돼요.</p>
      <div class="steps">
        <div><b>1</b>아래 버튼을 누르고 여행 간 날짜만 골라요</div>
        <div><b>2</b>사진이 책 페이지로 알아서 배치돼요</div>
        <div><b>3</b>AI로 글쓰기 → 답을 붙여넣으면 글이 채워져요</div>
      </div>
    </section>`;
  } else {
    html += `<div class="home-head"><h1>${list.length}권의 여행</h1><p>사진 ${S.photos.length}장</p></div>
      <div class="shelf">${list.map(({ t, i }, k) => {
        const plan = Pages.plan(t, i.ps); const c = plan.cover;
        return `<button class="issue" data-go="#/trip/${t.id}">
          <div class="issue-cover">${c ? imgTag(c, 'disp') : '<div class="empty">사진 없음</div>'}
            <div class="issue-tx"><div class="issue-no">No.${String(k + 1).padStart(2, '0')}${t.published ? ' · 발행됨' : ''}</div><h2>${esc(i.title)}</h2><div class="meta">${fmtRange(i.start, i.end)} · ${plan.shown.length}장</div></div>
          </div>
        </button>`; }).join('')}</div>`;
  }
  html += `<div class="page-bottom-space"></div>${dockHtml(false)}`;
  view().innerHTML = html;
  hydrate(view());
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
    img: img || ((p, role) => `data-key="${p.id}:${role === 'hero' ? 'print' : 'disp'}" src="${BLANK}"`) } };
}
function renderStory(id) {
  const t = S.trips.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  document.body.className = 'is-story';
  const { info, sctx } = storyCtx(t, { edit: true });
  document.title = info.title + ' · 나의 여행책';
  view().innerHTML = `<header class="top on-cover" id="top"><button class="back" data-go="#/">‹ 책장</button>
      <div class="top-title">${esc(info.title)}</div>
      <button class="icon-btn" data-act="pick">사진 고르기</button><button class="icon-btn" data-act="share-menu">보내기</button></header>
    <div data-trip="${t.id}">${Story.storyHTML(sctx)}</div>
    ${storyDock()}`;
  hydrate(view());
  onScrollTop();
}
function storyDock() {
  return `<nav class="fdock" aria-label="기록 도구"><button data-act="add"><span class="fi fi-plus" aria-hidden="true"></span>사진</button><button class="fd-main" data-act="voice"><span class="fi fi-mic" aria-hidden="true"></span>말로 남기기</button><button data-act="ai">AI 글쓰기</button></nav>`;
}
let lastY = 0;
function onScrollTop() {
  const t = $('#top'); if (!t) return;
  const y = window.scrollY;
  t.classList.toggle('scrolled', y > 4);
  if (document.body.classList.contains('is-story')) {
    const onCover = y < window.innerHeight - 80;
    t.classList.toggle('on-cover', onCover);
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
  window.scrollTo(0, 0);
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) renderStory(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/book\/(.+)$/))) renderTrip(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/print\/(.+)$/))) renderPrint(decodeURIComponent(m[1]));
  else renderHome();
}
function rerender() {
  const y = window.scrollY; const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) renderStory(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/book\/(.+)$/))) renderTrip(decodeURIComponent(m[1]));
  else if (!h.startsWith('#/print')) renderHome();
  window.scrollTo(0, y);
}
window.addEventListener('hashchange', route);
window.addEventListener('scroll', onScrollTop, { passive: true });

function toast(msg, ms = 2600, action) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.remove(); action.run(); };
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

window.App = { storyCtx, S, $, esc, uid, dayKey, fmtFull, fmtTime, fmtRange, placeText, tripInfo, tripPhotos, orderedTrips, issueNo, bookCtx, rerender, route, toast, urlFor, imgTag, BLANK };
