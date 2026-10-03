// 동선 비행: 스크롤하면 카메라가 찍은 곳을 차례로 날아가고, 선이 그려지고, 그 자리의 사진이 뜸
// 지도: OpenFreeMap(무료·키 없음, © OpenMapTiles, OpenStreetMap) + MapLibre, 3D 지형: Mapterhorn(무료 공개 지형 타일)
(() => {
const ML_VER = '5.24.0';
const STYLES = { light: 'https://tiles.openfreemap.org/styles/positron', '3d': 'https://tiles.openfreemap.org/styles/dark' };
const DEM = 'https://tiles.mapterhorn.com/tilejson.json';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mode = () => localStorage.getItem('mapStyle') === '3d' ? '3d' : 'light';

let libP = null;
function loadLib() {
  if (window.maplibregl) return Promise.resolve(true);
  if (libP) return libP;
  libP = new Promise(res => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
    s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
  });
  return libP;
}

// ----- HTML (앱·발행본 공통): 매거진 일정표 + 따라 움직이는 지도 -----
const hm = iso => iso ? iso.slice(11, 16) : '';
const mins = (a, b) => (a && b) ? Math.round((Date.parse(b + 'Z') - Date.parse(a + 'Z')) / 60000) : null;
const dur = n => n == null ? '' : n < 60 ? `${n}분` : `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}`;
function blockHTML(stops, { title, kicker = '', deckDate = '', img }) {
  if (!stops || stops.length < 2) return '';
  let dist = 0; for (let i = 1; i < stops.length; i++) dist += RouteMap.km(stops[i - 1].c, stops[i].c);
  const first = stops[0].start, last = stops[stops.length - 1].end;
  const span = mins(first, last);
  const data = esc(JSON.stringify(stops.map(s => ({ c: s.c, n: s.name, t: s.t }))));
  const kmTxt = d => d < 1 ? `${Math.round(d * 1000)}m` : d < 10 ? `${d.toFixed(1)}km` : `${Math.round(d)}km`;
  let list = '';
  stops.forEach((s, i) => {
    if (i) {
      const p = stops[i - 1]; const gap = mins(p.end, s.start); const d = RouteMap.km(p.c, s.c);
      list += `<li class="rt-leg"><span class="lg-by${s.move ? '' : ' lg-unk'}">${s.move ? esc(s.move.by) : '이동'}</span><span class="lg-meta">${gap != null ? dur(gap) + ' · ' : ''}${kmTxt(d)}</span>${s.move && s.move.evidence ? `<span class="lg-ev">${esc(s.move.evidence)}</span>` : ''}</li>`;
    }
    const stay = mins(s.start, s.end);
    const overnight = s.start && s.end && s.start.slice(0, 10) !== s.end.slice(0, 10);
    const newDay = s.start && i && stops[i - 1].start && s.start.slice(0, 10) !== stops[i - 1].start.slice(0, 10);
    list += `<li class="rt-stop" data-k="${i}">
      <div class="st-head"><span class="st-no">${String(i + 1).padStart(2, '0')}</span><span class="tm">${newDay ? `${+s.start.slice(5, 7)}/${+s.start.slice(8, 10)} ` : ''}${esc(s.t || '--:--')}${s.t2 && (s.t2 !== s.t || overnight) ? `–${overnight ? `${+s.end.slice(5, 7)}/${+s.end.slice(8, 10)} ` : ''}${esc(s.t2)}` : ''}</span>
        <h3>${esc(s.name || '이름 없는 곳')}</h3>${stay ? `<span class="st-meta">${dur(stay)} 머묾</span>` : ''}</div>
      <div class="st-pics${s.ids.length > 1 ? ' many' : ''}">${s.ids.slice(0, 3).map((id, j) => `<img ${img(id, j ? 'thumb' : 'body')} alt="">`).join('')}</div>
    </li>`;
  });
  return `<section class="st-route" data-stops="${data}">
    <header class="rt-head">
      <div class="rt-k">${esc(kicker)}</div>
      <h2 class="rt-t">${esc(title)}</h2>
      <dl class="rt-facts"><div><dt>시간</dt><dd>${hm(first)} – ${hm(last)}${span ? ` <small>${dur(span)}</small>` : ''}</dd></div><div><dt>장소</dt><dd>${stops.length}곳</dd></div><div><dt>거리</dt><dd>직선 ${kmTxt(dist)}</dd></div></dl>
    </header>
    <div class="rt-body">
      <div class="rt-mapcol"><div class="rt-sticky">
        <div class="fly-map"></div>
        <div class="fly-mode" role="group" aria-label="지도 모양"><button data-fm="light">평면</button><button data-fm="3d">지형</button></div>
      </div></div>
      <ol class="rt-list">${list}</ol>
    </div>
    <div class="fly-pics" hidden>${stops.map((s, i) => `<img data-i="${i}" ${img(s.ids[0])} alt="">`).join('')}</div>
  </section>`;
}

// 곡선 경로 (직선보다 비행 경로처럼 보이게)
function curve(pts) {
  const out = [], idx = [0];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]; // [lon, lat]
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const k = (i % 2 ? 1 : -1) * 0.18; const cx = mx - dy * k, cy = my + dx * k;
    for (let s = (i === 1 ? 0 : 1); s <= 24; s++) { const t = s / 24; out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]]); }
    idx.push(out.length - 1);
  }
  // 누적 길이 비율
  const L = [0]; for (let i = 1; i < out.length; i++) L.push(L[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  return { coords: out, frac: idx.map(j => L[j] / tot) };
}
const bearing = (a, b) => { const r = Math.PI / 180; const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r); const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r); return (Math.atan2(y, x) / r + 360) % 360; };
const grad = f => ['step', ['line-progress'], '#ff3b30', Math.min(1, Math.max(0.0005, f)), 'rgba(255,59,48,0)'];

function initOne(sec) {
  const stops = JSON.parse(sec.dataset.stops);
  const pts = stops.map(s => [s.c[1], s.c[0]]);
  const { coords, frac } = curve(pts);
  const m = mode(); sec.dataset.mode = m;
  sec.querySelectorAll('[data-fm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.fm === m));
  const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend(p));
  const map = new maplibregl.Map({ container: sec.querySelector('.fly-map'), style: STYLES[m], interactive: false, attributionControl: { compact: true },
    bounds: b, fitBoundsOptions: { padding: 60 }, pitch: 0, fadeDuration: 0, maxPitch: 75 });
  const st = { map, stops, pts, frac, prog: 0, target: 0, raf: 0, cur: null, markers: [], pin: null };
  sec._fly = st;
  map.on('load', () => {
    const firstSym = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
    if (m === 'light') {
      map.addSource('dem-hs', { type: 'raster-dem', url: DEM });
      map.addLayer({ id: 'hill', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#8a8478', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#b8b2a6' } }, firstSym);
    }
    if (m === '3d') {
      map.addSource('dem', { type: 'raster-dem', url: DEM });
      map.addSource('dem-hs', { type: 'raster-dem', url: DEM });
      map.addLayer({ id: 'hill', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#05080d', 'hillshade-highlight-color': '#9fb3c8', 'hillshade-accent-color': '#1a2433' } }, firstSym);
      map.setTerrain({ source: 'dem', exaggeration: 1.15 });
      try { map.setSky({ 'sky-color': '#0b1a2e', 'horizon-color': '#28405e', 'fog-color': '#0e1624', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 }); } catch { }
    }
    map.addSource('route', { type: 'geojson', lineMetrics: true, data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({ id: 'r-base', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': m === '3d' ? 'rgba(255,255,255,.5)' : 'rgba(20,20,20,.35)', 'line-width': 2, 'line-dasharray': [1.5, 2] } });
    map.addLayer({ id: 'r-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.6, 'line-gradient': grad(0) } });
    map.addLayer({ id: 'r-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 4, 'line-gradient': grad(0) } });
    // 작은 점 (지금 머문 곳은 사진으로 크게)
    stops.forEach((s, i) => {
      const el = document.createElement('div'); el.className = 'fly-dot'; el.textContent = i + 1;
      st.markers.push(new maplibregl.Marker({ element: el }).setLngLat(pts[i]).addTo(map));
    });
    const pinEl = document.createElement('div'); pinEl.className = 'fly-pin'; pinEl.innerHTML = '<div class="fp-in"><img alt=""><span></span></div>';
    st.pin = new maplibregl.Marker({ element: pinEl, anchor: 'bottom' }).setLngLat(pts[0]).addTo(map);
    map.on('render', () => declutter(st));
    // 저작권 표시는 작은 (i) 버튼으로 접어 둠 (누르면 펼쳐짐)
    const fold = () => sec.querySelectorAll('.maplibregl-ctrl-attrib.maplibregl-compact-show').forEach(a => { if (!a.dataset.userOpen) a.classList.remove('maplibregl-compact-show'); });
    sec.querySelector('.maplibregl-ctrl-attrib-button')?.addEventListener('click', () => { const a = sec.querySelector('.maplibregl-ctrl-attrib'); a.dataset.userOpen = a.classList.contains('maplibregl-compact-show') ? '1' : ''; });
    fold(); map.on('resize', fold); map.on('idle', fold);
    new ResizeObserver(() => map.resize()).observe(sec.querySelector('.fly-map'));
    st.loaded = true; go(sec, st.want ?? 'all', true);
  });
  return st;
}

// 겹치는 점은 숨김 (사진 핀과 겹치는 점 포함)
function declutter(st) {
  const map = st.map, shown = [];
  const pinPos = st.cur != null ? map.project(st.pts[st.cur]) : null;
  st.markers.forEach((mk, i) => {
    const p = map.project(st.pts[i]); const el = mk.getElement();
    let hide = i === st.cur;
    if (!hide && pinPos) { const pw = innerWidth >= 900 ? 50 : 42, ph = innerWidth >= 900 ? 108 : 92; if (p.x + 12 > pinPos.x - pw && p.x - 12 < pinPos.x + pw && p.y + 12 > pinPos.y - ph && p.y - 12 < pinPos.y + 4) hide = true; }
    if (!hide && shown.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 26)) hide = true;
    el.style.visibility = hide ? 'hidden' : 'visible'; if (!hide) shown.push(p);
  });
}

function animLine(st) {
  const step = () => {
    const d = st.target - st.prog; st.prog += d * 0.08;
    if (Math.abs(d) < 0.002) st.prog = st.target;
    ['r-line', 'r-glow'].forEach(id => st.map.getLayer(id) && st.map.setPaintProperty(id, 'line-gradient', grad(st.prog)));
    st.raf = st.prog !== st.target ? requestAnimationFrame(step) : 0;
  };
  if (!st.raf) st.raf = requestAnimationFrame(step);
}


// 카메라 비행: 지형 높이를 지키며 한 프레임씩 이동 (내장 flyTo는 비행 중 땅 높이를 버림)
function tween(st, to, dur) {
  const map = st.map; cancelAnimationFrame(st.cam || 0);
  const c0 = map.getCenter();
  const from = { lng: c0.lng, lat: c0.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), el: map.getCenterElevation ? map.getCenterElevation() : 0 };
  const tgt = { lng: to.center[0], lat: to.center[1], zoom: to.zoom, pitch: to.pitch, bearing: to.bearing, el: to.elevation || 0 };
  let db = ((tgt.bearing - from.bearing + 540) % 360) - 180;
  const distPx = Math.hypot((tgt.lng - from.lng), (tgt.lat - from.lat)) * 256 * 2 ** Math.min(from.zoom, tgt.zoom) / 360;
  const bump = Math.min(1.6, Math.max(0, Math.log2(distPx / 400 + 1)));
  const apply = t => {
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    map.jumpTo({ center: [from.lng + (tgt.lng - from.lng) * e, from.lat + (tgt.lat - from.lat) * e], zoom: from.zoom + (tgt.zoom - from.zoom) * e - bump * Math.sin(Math.PI * e),
      pitch: from.pitch + (tgt.pitch - from.pitch) * e, bearing: from.bearing + db * e, elevation: from.el + (tgt.el - from.el) * e });
  };
  if (!dur) { apply(1); return; }
  const t0 = performance.now();
  const step = now => { const t = Math.min(1, (now - t0) / dur); apply(t); st.cam = t < 1 ? requestAnimationFrame(step) : 0; if (t >= 1 && to.done) to.done(); };
  st.cam = requestAnimationFrame(step);
}

function go(sec, k, instant) {
  const st = sec._fly; if (!st) return; st.want = k; if (!st.loaded) return;
  const { map, stops, pts, frac } = st; const m = sec.dataset.mode;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = sec.querySelectorAll('.rt-stop');
  items.forEach(li => li.classList.toggle('on', li.dataset.k === String(k)));
  if (k === 'all') {
    st.cur = null; st.target = 1; st.pin.getElement().classList.remove('on');
    const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend(p));
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const cam = map.cameraForBounds(b, { padding: 56 }) || {};
    const ctr = cam.center ? [cam.center.lng ?? cam.center[0], cam.center.lat ?? cam.center[1]] : pts[0];
    tween(st, { center: ctr, zoom: cam.zoom || 11, pitch: 0, bearing: 0, elevation: m === '3d' ? (map.queryTerrainElevation(ctr) || 0) : 0 }, instant || reduce ? 0 : 1800);
  } else {
    const i = +k; st.cur = i; st.target = frac[i];
    const near = [pts[Math.max(0, i - 1)], pts[i], pts[Math.min(pts.length - 1, i + 1)]];
    const b = new maplibregl.LngLatBounds(); near.forEach(p => b.extend(p));
    const cam = map.cameraForBounds(b, { padding: 70 }) || {};
    const zoom = Math.min(m === '3d' ? 13.4 : 14.5, Math.max(8, (cam.zoom || 12) - 0.2));
    const br = i > 0 ? bearing(pts[i - 1], pts[i]) : (pts[1] ? bearing(pts[0], pts[1]) : 0);
    map.setPadding({ top: 60, bottom: 0, left: 0, right: 0 });
    const el = m === '3d' ? (map.queryTerrainElevation(pts[i]) || 0) : 0;
    tween(st, { center: pts[i], zoom, pitch: m === '3d' ? 55 : 0, bearing: m === '3d' ? br : 0, elevation: el,
      done: () => { if (st.cur !== i || m !== '3d') return; const e2 = map.queryTerrainElevation(pts[i]) || 0; if (Math.abs(e2 - el) > 100) tween(st, { center: pts[i], zoom, pitch: 55, bearing: br, elevation: e2 }, 600); } }, instant || reduce ? 0 : 2400);
    const pic = sec.querySelector(`.fly-pics img[data-i="${i}"]`);
    const pinEl = st.pin.getElement(); st.pin.setLngLat(pts[i]);
    const pimg = pinEl.querySelector('img');
    if (pic && pic.dataset.key && window.App && (!pic.src || pic.src.startsWith('data:image/gif'))) App.urlFor(pic.dataset.key).then(u => { if (u) { pic.src = u; if (st.cur === i) pimg.src = u; } });
    pimg.src = pic && pic.src || ''; pinEl.querySelector('span').textContent = stops[i].t || '';
    pinEl.classList.remove('on'); void pinEl.offsetWidth; pinEl.classList.add('on');
  }
  animLine(st); declutter(st);
}

function mount(root) {
  const secs = [...root.querySelectorAll('.st-route')]; if (!secs.length) return () => { };
  let alive = true; const cleanup = [];
  const pick = () => {
    for (const sec of secs) {
      const r = sec.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
      let k = 'all';
      const mapR = sec.querySelector('.rt-sticky').getBoundingClientRect();
      const anchor = innerWidth >= 900 ? innerHeight * 0.55 : Math.min(innerHeight * 0.8, mapR.bottom + 90);
      for (const li of sec.querySelectorAll('.rt-stop')) if (li.getBoundingClientRect().top < anchor) k = li.dataset.k;
      const st = sec._fly; if (st && st.want !== k) go(sec, k);
    }
  };
  let raf = 0; const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); };
  const io = new IntersectionObserver(async es => {
    for (const e of es) {
      if (!e.isIntersecting || e.target._fly) continue;
      const ok = await loadLib(); if (!alive) return;
      if (!ok) { e.target.classList.add('no-map'); continue; }
      initOne(e.target); pick();
    }
  }, { rootMargin: '800px 0px' });
  secs.forEach(s => io.observe(s));
  const onMode = e => {
    const b = e.target.closest('[data-fm]'); if (!b) return; const sec = b.closest('.st-route'); if (!sec) return;
    localStorage.setItem('mapStyle', b.dataset.fm);
    secs.forEach(s => { if (s._fly) { cancelAnimationFrame(s._fly.cam || 0); s._fly.map.remove(); s._fly = null; } initOne(s); });
    pick();
  };
  root.addEventListener('click', onMode);
  window.addEventListener('scroll', on, { passive: true, capture: true });
  cleanup.push(() => { alive = false; io.disconnect(); window.removeEventListener('scroll', on, { capture: true }); root.removeEventListener('click', onMode); secs.forEach(s => { if (s._fly) { cancelAnimationFrame(s._fly.raf); cancelAnimationFrame(s._fly.cam || 0); s._fly.map.remove(); s._fly = null; } }); });
  return () => cleanup.forEach(f => f());
}

window.Fly = { blockHTML, mount, loadLib, curve };
})();
