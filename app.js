// 나의 여행책 — 화면
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const S = { trips: [], photos: [], urls: new Map() };
const view = () => $('#view');

// ---------- 날짜 표기 ----------
const dayKey = p => (p.taken ? p.taken.slice(0, 10) : p.assignedDate || null);
function ymd(d) { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, wd: WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] }; }
const fmtDay = d => { const x = ymd(d); return `${x.m}월 ${x.d}일 ${x.wd}요일`; };
const fmtFull = d => { const x = ymd(d); return `${x.y}년 ${x.m}월 ${x.d}일 (${x.wd})`; };
const fmtTime = p => p.taken ? p.taken.slice(11, 16) : '';
function fmtRange(a, b) {
  if (!a) return '날짜 모름';
  const A = ymd(a); if (!b || a === b) return `${A.y}. ${A.m}. ${A.d}`;
  const B = ymd(b); return A.y === B.y ? `${A.y}. ${A.m}. ${A.d} – ${B.m}. ${B.d}` : `${A.y}. ${A.m}. ${A.d} – ${B.y}. ${B.m}. ${B.d}`;
}
const placeText = p => p.place && p.place.name ? p.place.name + (p.place.near ? ' 근처' : '') : '';

// ---------- 여행 정보 계산 ----------
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
  const cover = ps.find(p => p.id === t.coverId) || ps.find(p => Layout.isLand(p)) || ps[0] || null;
  return { ps, days, start: days[0] || null, end: days[days.length - 1] || null, places, countries, title, cover };
}
function orderedTrips() {
  return S.trips.map(t => ({ t, i: tripInfo(t) })).filter(x => x.i.ps.length || !x.t.undatedBin)
    .sort((a, b) => (a.i.start || '9999').localeCompare(b.i.start || '9999'));
}
function issueNo(id) { const o = orderedTrips(); return String(o.findIndex(x => x.t.id === id) + 1).padStart(2, '0'); }

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
  }), { rootMargin: '900px 0px' }) : null;
  root.querySelectorAll('img[data-key]').forEach(img => io ? io.observe(img) : loadImg(img));
}
async function loadImg(img) { const u = await urlFor(img.dataset.key); if (u) img.src = u; }
async function hydrateAll(root) {
  const imgs = [...root.querySelectorAll('img[data-key]')];
  await Promise.all(imgs.map(async img => { await loadImg(img); try { await img.decode(); } catch { } }));
}
const imgTag = (p, kind, cls = '') => `<img ${cls ? `class="${cls}"` : ''} data-key="${p.id}:${kind}" width="${p.w || 1}" height="${p.h || 1}" alt="${esc(p.note ? p.note.slice(0, 60) : (placeText(p) || '여행 사진'))}">`;

function dockHtml() {
  const folderOk = ('showDirectoryPicker' in window || 'webkitdirectory' in document.createElement('input')) && !/iPhone|iPad|iPod/i.test(navigator.userAgent);
  return `<div class="dock"><button class="btn-main" data-act="add"><span class="plus">+</span> ${folderOk ? '날짜로 사진 넣기' : '사진 넣기'}</button>${folderOk ? '<button class="btn-sub" data-act="pick-files-direct">직접 고르기</button>' : ''}</div>`;
}

// ---------- 홈 ----------
function renderHome() {
  document.title = '나의 여행책';
  const list = orderedTrips();
  const total = S.photos.length;
  let html = `<header class="top" id="top"><div class="brand">나의 여행책</div>
    ${list.length ? `<button class="icon-btn" data-act="home-menu" aria-label="더보기">더보기</button>` : ''}</header>`;
  if (!list.length) {
    html += `<section class="welcome">
      <h1>찍은 사진만 고르면<br>여행책이 돼요</h1>
      <p>언제, 어디서 찍었는지는 사진에 담긴 정보로 알아서 채워요.</p>
      <p>쓰고 싶을 때만 한마디 적으면 끝이에요.</p>
      <div class="steps">
        <div><b>1</b>아래 버튼을 누르고 <strong>여행 간 날짜</strong>만 골라요 (카메라 폴더는 처음 한 번만 연결)</div>
        <div><b>2</b>날짜별로 여행이 알아서 나뉘어요</div>
        <div><b>3</b>사진을 누르면 한마디를 쓸 수 있어요</div>
      </div>
    </section>`;
  } else {
    html += `<div class="home-head"><h1>${list.length}권의 여행</h1><p>사진 ${total}장 · 모이면 한 권의 책으로 뽑을 수 있어요</p></div>
      <div class="shelf">${list.map(({ t, i }, k) => `
        <button class="issue" data-go="#/trip/${t.id}">
          <div class="issue-cover">${i.cover ? imgTag(i.cover, 'thumb') : '<div class="empty">사진 없음</div>'}<span class="no">No.${String(k + 1).padStart(2, '0')}</span></div>
          <h2>${esc(i.title)}</h2>
          <div class="meta">${fmtRange(i.start, i.end)} · ${i.ps.length}장</div>
        </button>`).join('')}</div>`;
  }
  html += `<div class="page-bottom-space"></div>
    ${dockHtml()}`;
  view().innerHTML = html;
  hydrate(view());
}

// ---------- 여행 한 권 ----------
let IMG_KIND = 'disp';
function figure(p, extra = '') {
  const cap = [fmtTime(p) && `<span class="t">${fmtTime(p)}</span>`, placeText(p) && `<span>${esc(placeText(p))}</span>`].filter(Boolean).join('');
  return `<figure class="fig" ${extra}><button class="ph" data-photo="${p.id}" aria-label="사진 열기">${imgTag(p, IMG_KIND)}</button>${cap ? `<figcaption class="cap">${cap}</figcaption>` : ''}</figure>`;
}
function renderBlock(b) {
  const it = b.items;
  switch (b.type) {
    case 'wide': return `<div class="blk b-wide">${figure(it[0])}</div>`;
    case 'pair': case 'row3':
      return `<div class="blk row">${it.map(p => figure(p, `style="flex-grow:${Layout.ar(p).toFixed(4)}"`)).join('')}</div>`;
    case 'trio': {
      // 큰 사진 아래끝 = 옆 두 장 중 아래 사진 아래끝 (캡션 높이·간격까지 계산)
      const [A, B, C] = it.map(Layout.ar); const Ssum = (1 / A + 1 / B + 1 / C).toFixed(5);
      const side = `calc(((100% - var(--gap)) / ${A.toFixed(5)} - var(--caph) - var(--gap)) / ${Ssum})`;
      return `<div class="blk trio ${b.side}">${figure(it[0], `style="flex:1 1 0"`)}<div class="col" style="flex:0 0 ${side}">${figure(it[1])}${figure(it[2])}</div></div>`;
    }
    case 'solo': return `<div class="blk solo ${b.side}">${figure(it[0])}</div>`;
    case 'story': return `<div class="blk story ${b.side} ${b.land ? 'land' : 'portrait'}">${figure(it[0])}
      <div class="story-text"><span class="quote-mark"></span><p>${esc(it[0].note)}</p></div></div>`;
  }
  return '';
}
function tripBody(t, { print = false } = {}) {
  IMG_KIND = print ? 'print' : 'disp';
  const i = tripInfo(t);
  const groups = new Map();
  i.ps.forEach(p => { const k = dayKey(p) || 'unknown'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  const keys = [...groups.keys()].sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b));
  const metaBits = [fmtRange(i.start, i.end), i.places.slice(0, 4).join(' · '), `사진 ${i.ps.length}장`].filter(Boolean);
  let h = `<section class="cover">
    ${i.cover ? `<figure class="cover-photo">${imgTag(i.cover, IMG_KIND)}</figure>` : ''}
    <div class="cover-text">
      <div class="kicker">No.${issueNo(t.id)}${i.countries.length ? ' · ' + esc(i.countries.join(' · ')) : ''}</div>
      ${print ? `<h1 class="title">${esc(i.title)}</h1>` : `<button class="title-edit" data-act="edit-title" aria-label="제목 바꾸기"><h1 class="title">${esc(i.title)}</h1></button>`}
      <div class="cover-meta">${metaBits.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      ${t.lede ? (print ? `<p class="lede">${esc(t.lede)}</p>` : `<button class="lede-btn" data-act="edit-lede"><p class="lede">${esc(t.lede)}</p></button>`)
      : (print ? '' : `<button class="write-hint" data-act="edit-lede">이 여행을 한 줄로 남겨볼까요? (안 써도 돼요)</button>`)}
    </div></section>`;
  keys.forEach(k => {
    const ps = groups.get(k);
    const no = k === 'unknown' ? '–' : String(Meta.dayDiff(i.start, k) + 1).padStart(2, '0');
    const places = [...new Set(ps.map(p => p.place && p.place.name).filter(Boolean))];
    const note = (t.dayNotes || {})[k];
    h += `<section class="day" data-day="${k}">
      <div class="day-head"><div class="day-no">${no}</div><div><div class="day-date">${k === 'unknown' ? '날짜 모르는 사진' : fmtDay(k)}</div>
        <div class="day-place">${esc(places.join(' · ')) || '&nbsp;'}</div></div></div>
      ${note ? `<div class="day-note">${print ? `<p class="lede">${esc(note)}</p>` : `<button class="lede-btn" data-act="edit-day" data-day="${k}"><p class="lede">${esc(note)}</p></button>`}</div>`
      : (print ? '' : `<div class="day-note"><button class="write-hint" data-act="edit-day" data-day="${k}">이날 이야기 쓰기</button></div>`)}
      <div class="blocks">${Layout.planDay(ps).map(renderBlock).join('')}</div>
    </section>`;
  });
  h += `<div class="mag-end"><span>${esc(i.title)}</span><span>${fmtRange(i.start, i.end)}</span></div>`;
  return h;
}
function renderTrip(id) {
  const t = S.trips.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  document.title = tripInfo(t).title + ' · 나의 여행책';
  view().innerHTML = `<header class="top" id="top"><button class="back" data-go="#/">‹ 책장</button>
      <button class="icon-btn" data-act="print-trip">책으로 뽑기</button><button class="icon-btn" data-act="trip-menu" aria-label="더보기">더보기</button></header>
    <article class="mag" data-trip="${t.id}">${tripBody(t)}</article>
    <div class="page-bottom-space"></div>
    ${dockHtml()}`;
  hydrate(view());
}

// ---------- 책으로 뽑기 ----------
async function renderPrint(which) {
  const list = which === 'all' ? orderedTrips().map(x => x.t) : S.trips.filter(t => t.id === which);
  if (!list.length) { location.hash = '#/'; return; }
  const all = which === 'all';
  view().innerHTML = `<header class="top no-print"><button class="back" data-go="${all ? '#/' : '#/trip/' + which}">‹ 돌아가기</button>
      <button class="icon-btn" data-act="do-print">PDF로 저장</button></header>
    <div class="no-print tip" style="margin:12px 20px">사진을 불러오는 중이에요… 준비되면 인쇄 창이 열려요. 인쇄 창에서 <b>PDF로 저장</b>을 고르면 책 파일이 돼요.</div>
    ${all ? `<section class="toc print-only"><h1>나의 여행책</h1><ol>${list.map((t, k) => { const i = tripInfo(t); return `<li><b>${String(k + 1).padStart(2, '0')}</b>${esc(i.title)}<span>${fmtRange(i.start, i.end)}</span></li>`; }).join('')}</ol></section>` : ''}
    ${list.map(t => `<article class="mag book-trip">${tripBody(t, { print: true })}</article>`).join('')}`;
  await hydrateAll(view());
  const tip = $('.tip', view()); if (tip) tip.innerHTML = '준비됐어요. 인쇄 창에서 <b>PDF로 저장</b>을 고르세요. 창이 안 뜨면 위의 <b>PDF로 저장</b>을 눌러요.';
  setTimeout(() => window.print(), 300);
}

// ---------- 길찾기 ----------
function route() {
  const h = location.hash || '#/';
  window.scrollTo(0, 0);
  let m;
  if ((m = h.match(/^#\/trip\/(.+)$/))) renderTrip(decodeURIComponent(m[1]));
  else if ((m = h.match(/^#\/print\/(.+)$/))) renderPrint(decodeURIComponent(m[1]));
  else renderHome();
}
function rerender() { // 같은 화면을 스크롤 유지하며 다시 그림
  const y = window.scrollY; const h = location.hash || '#/';
  const m = h.match(/^#\/trip\/(.+)$/);
  if (m) renderTrip(decodeURIComponent(m[1])); else if (!h.startsWith('#/print')) renderHome();
  window.scrollTo(0, y);
}
window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => { const t = $('#top'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

function toast(msg, ms = 2600) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

window.App = { S, $, esc, uid, dayKey, fmtFull, fmtTime, fmtRange, placeText, tripInfo, orderedTrips, rerender, route, toast, urlFor, imgTag };
