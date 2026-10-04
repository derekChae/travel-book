// 나의 여권: 다녀온 장소마다 도장 하나. 도장 가운데 그림은 내가 그곳에서 찍은 사진을 판화처럼 잉크로 바꾼 것.
// 나라마다 입국 도장 한 개 + 장소 도장들. 통계(나라·장소·일수·거리)와 내 카메라(기종·렌즈·초점거리).
(() => {
const { S, esc } = App;
const EN = { 일본: 'JAPAN', 한국: 'KOREA', 대한민국: 'KOREA', 중국: 'CHINA', 대만: 'TAIWAN', 홍콩: 'HONG KONG', 마카오: 'MACAO', 태국: 'THAILAND', 베트남: 'VIET NAM', 라오스: 'LAOS', 캄보디아: 'CAMBODIA', 필리핀: 'PHILIPPINES', 인도네시아: 'INDONESIA', 말레이시아: 'MALAYSIA', 싱가포르: 'SINGAPORE', 몽골: 'MONGOLIA', 네팔: 'NEPAL', 인도: 'INDIA', 스리랑카: 'SRI LANKA', 미국: 'U.S.A.', 캐나다: 'CANADA', 멕시코: 'MÉXICO', 페루: 'PERÚ', 칠레: 'CHILE', 아르헨티나: 'ARGENTINA', 브라질: 'BRASIL', 영국: 'UNITED KINGDOM', 프랑스: 'FRANCE', 독일: 'DEUTSCHLAND', 이탈리아: 'ITALIA', 스페인: 'ESPAÑA', 포르투갈: 'PORTUGAL', 스위스: 'SWITZERLAND', 오스트리아: 'ÖSTERREICH', 체코: 'ČESKO', 헝가리: 'MAGYARORSZÁG', 크로아티아: 'HRVATSKA', 그리스: 'ΕΛΛΑΔΑ', 튀르키예: 'TÜRKİYE', 터키: 'TÜRKİYE', 아이슬란드: 'ÍSLAND', 노르웨이: 'NORGE', 스웨덴: 'SVERIGE', 핀란드: 'SUOMI', 덴마크: 'DANMARK', 네덜란드: 'NEDERLAND', 벨기에: 'BELGIQUE', 호주: 'AUSTRALIA', 뉴질랜드: 'NEW ZEALAND', 이집트: 'EGYPT', 모로코: 'MAROC', 조지아: 'GEORGIA', 우즈베키스탄: 'UZBEKISTAN' };
const INKS = ['#203f73', '#b3342b', '#2e6a4b', '#5a3b7d', '#8b4a20', '#0f6d79'];
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const ymd = d => d ? d.replace(/-/g, '.') : '';
const coordOf = p => p.lat != null ? [p.lat, p.lon] : (p.place && p.place.lat != null ? [p.place.lat, p.place.lon] : null);
const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180; const dl = r(b[0] - a[0]), dn = r(b[1] - a[1]); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// 여권 데이터: 나라 → 장소(처음 간 날, 대표 사진, 여행)
function collect() {
  const trips = App.orderedTrips();
  const countries = new Map(); let dist = 0; const days = new Set(); let nPhoto = 0;
  trips.forEach(({ t, i }, k) => {
    const ps = i.ps.filter(p => !p.hidden);
    nPhoto += ps.filter(p => p.kind !== 'video').length;
    i.days.forEach(d => days.add(d));
    let prev = null;
    ps.forEach(p => { const c = coordOf(p); if (c) { if (prev) { const d = km(prev, c); if (d < 3000) dist += d; } prev = c; } });
    ps.forEach(p => {
      const pl = p.place; if (!pl || !pl.name) return;
      const cn = pl.country || App.countryOf(i); if (!cn || cn === '나라 미정') return;
      if (!countries.has(cn)) countries.set(cn, { name: cn, first: null, places: new Map(), trips: new Set() });
      const C = countries.get(cn); C.trips.add(t.id);
      const d = App.dayKey(p);
      if (d && (!C.first || d < C.first)) C.first = d;
      if (!C.places.has(pl.name)) C.places.set(pl.name, { name: pl.name, first: d, photos: [], trip: t, no: String(k + 1).padStart(2, '0') });
      const P = C.places.get(pl.name); P.photos.push(p); if (d && (!P.first || d < P.first)) { P.first = d; P.trip = t; P.no = String(k + 1).padStart(2, '0'); }
    });
  });
  const list = [...countries.values()].sort((a, b) => (a.first || '').localeCompare(b.first || ''));
  list.forEach(C => { C.list = [...C.places.values()].sort((a, b) => (a.first || '').localeCompare(b.first || '')); });
  return { list, stats: { countries: list.length, places: list.reduce((n, C) => n + C.list.length, 0), days: days.size, km: Math.round(dist), photos: nPhoto } };
}

// 사진 → 판화 잉크 (진한 곳은 꽉, 중간은 가로줄, 밝은 곳은 비움)
const inkCache = new Map();
async function inkImage(p, ink, size = 150) {
  const key = p.id + ink; if (inkCache.has(key)) return inkCache.get(key);
  const u = await App.urlFor(p.id + ':disp') || await App.urlFor(p.id + ':thumb'); if (!u) return '';
  const img = new Image(); img.src = u; try { await img.decode(); } catch { return ''; }
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  const s = Math.max(size / img.naturalWidth, size / img.naturalHeight); const w = img.naturalWidth * s, h = img.naturalHeight * s;
  const fx = p.focus ? p.focus.x / 100 : 0.5, fy = p.focus ? p.focus.y / 100 : 0.5;
  g.drawImage(img, (size - w) * fx, (size - h) * fy, w, h);
  const d = g.getImageData(0, 0, size, size), a = d.data;
  const L = new Float32Array(size * size);
  // 밝기 = 가장 밝은 색 채널 쪽으로: 파란 하늘이 시커먼 덩어리가 되지 않고 결로 남음
  for (let i = 0; i < L.length; i++) { const R = a[i * 4], G = a[i * 4 + 1], B = a[i * 4 + 2]; L[i] = 0.45 * Math.max(R, G, B) + 0.55 * (0.299 * R + 0.587 * G + 0.114 * B); }
  const sorted = Float32Array.from(L).sort(); const lo = sorted[Math.floor(L.length * 0.04)], hi = sorted[Math.floor(L.length * 0.96)] || 255;
  const [r, gg, b] = [1, 3, 5].map(k => parseInt(ink.slice(k, k + 2), 16));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; const v = Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo || 1)));
    // 판화 느낌: 아래로 갈수록 선이 굵어지지 않게, 톤만으로 결정
    const on = v < 0.22 || (v < 0.45 && y % 3 !== 2) || (v < 0.66 && y % 3 === 0) || (v < 0.84 && y % 6 === 0 && (x >> 1) % 2 === 0);
    a[i * 4] = r; a[i * 4 + 1] = gg; a[i * 4 + 2] = b; a[i * 4 + 3] = on ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  const out = c.toDataURL('image/png'); inkCache.set(key, out); return out;
}

// 도장 모양 SVG
let uidN = 0;
function stampSVG({ kind, ink, top, bottom, name, date, img, seed }) {
  const id = 'sp' + (uidN++);
  const shape = kind === 'entry' ? 'entry' : ['circle', 'rect', 'oct', 'oval'][Math.imul(seed ^ (seed >>> 13), 2654435761) >>> 30];
  const W = shape === 'entry' ? 260 : shape === 'oval' ? 230 : 200, H = shape === 'entry' ? 150 : shape === 'oval' ? 170 : 200;
  const cx = W / 2, cy = H / 2;
  const nm = name.length > 9 ? name.slice(0, 9) + '…' : name;
  const nsz = nm.length <= 4 ? 22 : nm.length <= 6 ? 19 : 16;
  let body = '';
  const band = (y, w) => `<rect x="${cx - w / 2}" y="${y - 14}" width="${w}" height="28" fill="${ink}"/><text x="${cx}" y="${y + 1}" font-size="${nsz}" font-weight="800" fill="#f6efe1" text-anchor="middle" dominant-baseline="middle" font-family="SUIT Variable, sans-serif" letter-spacing="-0.5">${esc(nm)}</text>`;
  const pic = (x, y, w, h, clip) => img ? `<clipPath id="${id}c">${clip}</clipPath><image href="${img}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}c)"/>` : '';
  if (shape === 'circle') {
    body = `<circle cx="${cx}" cy="${cy}" r="94" fill="none" stroke="${ink}" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="${ink}" stroke-width="1.6"/>
      <path id="${id}t" d="M ${cx - 72} ${cy} A 72 72 0 0 1 ${cx + 72} ${cy}" fill="none"/><path id="${id}b" d="M ${cx - 76} ${cy} A 76 76 0 0 0 ${cx + 76} ${cy}" fill="none"/>
      <text font-size="13" font-weight="700" fill="${ink}" letter-spacing="2.5" font-family="SUIT Variable, sans-serif"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(top)}</textPath></text>
      <text font-size="12" font-weight="700" fill="${ink}" letter-spacing="2" font-family="ui-monospace, Menlo, monospace"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(bottom)}</textPath></text>
      ${pic(cx - 58, cy - 66, 116, 92, `<circle cx="${cx}" cy="${cy - 18}" r="56"/>`)}${band(cy + 40, 132)}`;
  } else if (shape === 'rect') {
    body = `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="16" fill="none" stroke="${ink}" stroke-width="5"/><rect x="15" y="15" width="${W - 30}" height="${H - 30}" rx="9" fill="none" stroke="${ink}" stroke-width="1.4" stroke-dasharray="4 3"/>
      <text x="${cx}" y="34" font-size="12.5" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="2.5" font-family="SUIT Variable, sans-serif">${esc(top)}</text>
      ${pic(24, 42, W - 48, 92, `<rect x="24" y="42" width="${W - 48}" height="92" rx="4"/>`)}${band(150, W - 40)}
      <text x="${cx}" y="182" font-size="12" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="1.5" font-family="ui-monospace, Menlo, monospace">${esc(bottom)}</text>`;
  } else if (shape === 'oct') {
    const pts = [...Array(8)].map((_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return `${cx + 96 * Math.cos(a)},${cy + 96 * Math.sin(a)}`; }).join(' ');
    const pts2 = [...Array(8)].map((_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return `${cx + 86 * Math.cos(a)},${cy + 86 * Math.sin(a)}`; }).join(' ');
    body = `<polygon points="${pts}" fill="none" stroke="${ink}" stroke-width="5"/><polygon points="${pts2}" fill="none" stroke="${ink}" stroke-width="1.5"/>
      <text x="${cx}" y="${cy - 60}" font-size="12.5" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="2.5" font-family="SUIT Variable, sans-serif">${esc(top)}</text>
      ${pic(cx - 62, cy - 50, 124, 74, `<rect x="${cx - 62}" y="${cy - 50}" width="124" height="74"/>`)}${band(cy + 40, 150)}
      <text x="${cx}" y="${cy + 72}" font-size="12" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="1.5" font-family="ui-monospace, Menlo, monospace">${esc(bottom)}</text>`;
  } else if (shape === 'oval') {
    body = `<ellipse cx="${cx}" cy="${cy}" rx="${cx - 6}" ry="${cy - 6}" fill="none" stroke="${ink}" stroke-width="5"/><ellipse cx="${cx}" cy="${cy}" rx="${cx - 15}" ry="${cy - 15}" fill="none" stroke="${ink}" stroke-width="1.5"/>
      <text x="${cx}" y="38" font-size="12.5" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="2.5" font-family="SUIT Variable, sans-serif">${esc(top)}</text>
      ${pic(cx - 66, 46, 132, 62, `<ellipse cx="${cx}" cy="77" rx="66" ry="31"/>`)}${band(124, 160)}
      <text x="${cx}" y="152" font-size="12" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="1.5" font-family="ui-monospace, Menlo, monospace">${esc(bottom)}</text>`;
  } else {
    // 입국 도장
    body = `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="10" fill="none" stroke="${ink}" stroke-width="5"/><line x1="16" y1="50" x2="${W - 16}" y2="50" stroke="${ink}" stroke-width="1.5"/><line x1="16" y1="108" x2="${W - 16}" y2="108" stroke="${ink}" stroke-width="1.5"/>
      <text x="20" y="36" font-size="15" font-weight="800" fill="${ink}" letter-spacing="3" font-family="SUIT Variable, sans-serif">ENTRY · 입국</text>
      <text x="${W - 20}" y="36" font-size="13" font-weight="700" fill="${ink}" text-anchor="end" font-family="ui-monospace, Menlo, monospace">${esc(bottom)}</text>
      <text x="${cx}" y="88" font-size="${name.length > 5 ? 28 : 34}" font-weight="800" fill="${ink}" text-anchor="middle" letter-spacing="1" font-family="SUIT Variable, sans-serif">${esc(top)}</text>
      <text x="20" y="133" font-size="13" font-weight="700" fill="${ink}" font-family="SUIT Variable, sans-serif">${esc(name)}</text>
      <text x="${W - 20}" y="133" font-size="12" font-weight="700" fill="${ink}" text-anchor="end" font-family="ui-monospace, Menlo, monospace">${esc(date)}</text>`;
  }
  // 잉크 번짐과 빠진 자국
  const f = `<filter id="${id}f" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${0.55 + (seed % 5) * 0.04}" numOctaves="2" seed="${seed % 97}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="s"/><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="1" seed="${(seed >> 3) % 97}" result="w"/><feDisplacementMap in="s" in2="w" scale="1.6"/></filter>`;
  return `<svg class="stp-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${f}</defs><g filter="url(#${id}f)" opacity=".94">${body}</g></svg>`;
}

const SEEN = 'stampsSeen';
async function render() {
  document.title = '나의 여권 · 나의 여행책';
  document.body.className = 'is-home is-passport';
  const { list, stats } = collect();
  const seen = new Set(JSON.parse(localStorage.getItem(SEEN) || '[]'));
  const fresh = [];
  const view = document.getElementById('view');
  const gear = gearStats();
  view.innerHTML = `<div class="shelf-root quiet">
    <header class="top" id="top"><button class="back" data-go="#/">‹ 책장</button><div class="top-title">나의 여권</div><span style="width:64px"></span></header>
    <section class="pp-cover">
      <div class="pp-emb">PASSPORT · 여권</div>
      <h1>나의 여권</h1>
      <div class="pp-stats">
        <div><b>${stats.countries}</b><span>나라</span></div><div><b>${stats.places}</b><span>도장</span></div>
        <div><b>${stats.days}</b><span>여행한 날</span></div><div><b>${stats.km.toLocaleString()}</b><span>km 이동</span></div>
      </div>
    </section>
    ${list.length ? '' : '<p class="sh-empty" style="padding-top:20px">사진 속 장소가 확인되면 그곳의 도장이 여기에 찍혀요.</p>'}
    ${list.map((C, ci) => `<section class="pp-page" data-c="${esc(C.name)}">
      <div class="pp-ph"><span class="pp-cn">${esc(C.name)}</span><span class="pp-cm">도장 ${C.list.length}개 · 여행 ${C.trips.size}번</span><span class="pp-pg">${String(ci + 1).padStart(2, '0')}</span></div>
      <div class="pp-grid">
        <div class="stp stp-entry" data-k="entry:${esc(C.name)}" style="--r:${(hash(C.name) % 7) - 3}deg"></div>
        ${C.list.map(P => `<button class="stp" data-k="${esc(C.name + ':' + P.name)}" data-go="#/trip/${P.trip.id}" style="--r:${(hash(P.name) % 17) - 8}deg" aria-label="${esc(P.name)} 도장, ${ymd(P.first)}"></button>`).join('')}
      </div>
    </section>`).join('')}
    ${gear ? `<section class="pp-page pp-gear"><div class="pp-ph"><span class="pp-cn">내 카메라</span><span class="pp-cm">사진 ${gear.n}장 기준</span></div>${gear.html}</section>` : ''}
    <div class="page-bottom-space"></div></div>`;
  // 도장 그리기
  for (const C of list) {
    const ink0 = INKS[hash(C.name) % INKS.length];
    const en = view.querySelector(`[data-k="entry:${CSS.escape(C.name)}"]`);
    en.innerHTML = stampSVG({ kind: 'entry', ink: ink0, top: EN[C.name] || C.name, name: C.name, bottom: 'No.' + String(list.indexOf(C) + 1).padStart(2, '0'), date: ymd(C.first), seed: hash(C.name) });
    if (!seen.has('entry:' + C.name)) fresh.push(en);
    for (const P of C.list) {
      const seed = hash(P.name); const ink = INKS[(seed >>> 8) % INKS.length];
      const best = P.photos.find(p => p.hero) || P.photos.find(p => p.kind !== 'video') || P.photos[0];
      const img = best ? await inkImage(best, ink) : '';
      const el = view.querySelector(`[data-k="${CSS.escape(C.name + ':' + P.name)}"]`); if (!el) continue;
      el.innerHTML = stampSVG({ ink, top: EN[C.name] || C.name, bottom: ymd(P.first), name: P.name, img, seed }) + `<span class="stp-cap">${esc(P.name)}<i>${ymd(P.first)}</i></span>`;
      if (!seen.has(C.name + ':' + P.name)) fresh.push(el);
    }
  }
  // 새 도장은 '쿵' 찍히는 모습으로
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fresh.length && !reduce && 'IntersectionObserver' in window) {
    fresh.forEach(el => el.classList.add('pending'));
    let n = 0;
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); const el = e.target; setTimeout(() => { el.classList.remove('pending'); el.classList.add('thunk'); }, 160 + (n++ % 6) * 260); }), { threshold: 0.5 });
    fresh.forEach(el => io.observe(el));
  }
  fresh.forEach(el => seen.add(el.dataset.k));
  localStorage.setItem(SEEN, JSON.stringify([...seen]));
}

// 내 카메라: 기종, 렌즈, 초점거리 분포
function gearStats() {
  const ps = S.photos.filter(p => p.kind !== 'video' && p.shot);
  if (!ps.length) return null;
  const count = f => { const m = new Map(); ps.forEach(p => { const k = f(p); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const bodies = count(p => p.shot.body);
  const B = [[0, 20, '초광각'], [20, 35, '광각'], [35, 70, '표준'], [70, 200, '망원'], [200, 1e4, '초망원']];
  const fl = B.map(([a, b, n]) => [n, ps.filter(p => { const m = p.shot.mm35 || p.shot.mm; return m && m >= a && m < b; }).length]);
  const max = Math.max(1, ...fl.map(x => x[1]));
  const top = fl.slice().sort((a, b) => b[1] - a[1])[0];
  const fs = ps.map(p => p.shot.f).filter(Boolean).sort((a, b) => a - b);
  const bar = (n, v, mx) => `<div class="gr"><span class="gr-n">${esc(n)}</span><span class="gr-b"><i style="width:${Math.round(v / mx * 100)}%"></i></span><span class="gr-v">${v}</span></div>`;
  return { n: ps.length, html: `<div class="gear">
    <div class="gear-hl"><b>${esc(top[0])}</b>을 가장 많이 썼어요<span>${top[1]}장 · 전체의 ${Math.round(top[1] / ps.length * 100)}%</span></div>
    <div class="gear-sec"><div class="gear-h">초점거리 (35mm 환산)</div>${fl.map(([n, v]) => bar(n, v, max)).join('')}</div>
    <div class="gear-sec"><div class="gear-h">카메라</div>${bodies.slice(0, 4).map(([n, v]) => bar(n, v, bodies[0][1])).join('')}</div>
    ${fs.length ? `<div class="gear-sec gear-mini"><div><span>가장 밝게</span><b>f/${fs[0]}</b></div><div><span>자주 쓴 조리개</span><b>f/${fs[Math.floor(fs.length / 2)]}</b></div></div>` : ''}
  </div>` };
}

window.Passport = { render, collect, stampSVG, inkImage };
})();
