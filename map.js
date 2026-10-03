// 지도 동선: 위치가 있는 사진을 찍은 순서대로 이어 그날의 길을 그림 (지도 © OpenStreetMap)
(() => {
const TILE = 256;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coord = p => p.lat != null ? [p.lat, p.lon] : (p.place && p.place.lat != null ? [p.place.lat, p.place.lon] : null);
const km = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// 머문 곳 묶기: 300m 안에서 이어 찍은 사진은 한 곳
function stops(photos) {
  const out = [];
  for (const p of photos) {
    const c = coord(p); if (!c) continue;
    const last = out[out.length - 1];
    const tm = p.taken ? p.taken.slice(11, 16) : '';
    if (last && km(last.c, c) < 0.3) { last.ids.push(p.id); if (tm) last.t2 = tm; if (p.taken) last.end = p.taken; continue; }
    out.push({ c, ids: [p.id], name: (p.place && p.place.name) || '', t: tm, t2: tm, start: p.taken || null, end: p.taken || null, move: p.moveBy || null });
  }
  return out;
}
function blockHTML(sts, { title = '그날의 동선', id = '' } = {}) {
  if (sts.length < 2) return '';
  let dist = 0; for (let i = 1; i < sts.length; i++) dist += km(sts[i - 1].c, sts[i].c);
  const data = esc(JSON.stringify(sts.map(s => s.c)));
  return `<section class="st-map" ${id ? `data-map-day="${id}"` : ''}>
    <div class="mp-box" data-pts="${data}"><div class="mp-tiles"></div><svg class="mp-svg" aria-hidden="true"></svg><div class="mp-dots"></div><div class="mp-attr">© OpenStreetMap</div></div>
    <div class="mp-cap"><div class="mp-head"><b>${esc(title)}</b><span>찍은 곳을 순서대로 이은 선 · 약 ${dist < 10 ? dist.toFixed(1) : Math.round(dist)}km</span></div>
      <ol class="mp-legend">${sts.map((s, i) => `<li><span class="mp-n">${i + 1}</span>${s.t ? `<span class="mp-t">${s.t}</span>` : ''}<span>${esc(s.name || '이름 없는 곳')}</span></li>`).join('')}</ol></div>
  </section>`;
}

// 웹 메르카토르
const px = (lat, lon, z) => { const s = TILE * 2 ** z; const x = (lon + 180) / 360 * s; const sin = Math.sin(lat * Math.PI / 180); const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s; return [x, y]; };

function layout(box) {
  const pts = JSON.parse(box.dataset.pts); const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
  const pad = Math.min(W, H) * 0.2;
  let z = 17;
  for (; z > 2; z--) { const ps = pts.map(p => px(p[0], p[1], z)); const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); if (Math.max(...xs) - Math.min(...xs) <= W - pad * 2 && Math.max(...ys) - Math.min(...ys) <= H - pad * 2) break; }
  const ps = pts.map(p => px(p[0], p[1], z)); const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const ox = cx - W / 2, oy = cy - H / 2;
  // 타일
  const tiles = box.querySelector('.mp-tiles'); let th = '';
  const n = 2 ** z;
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + W) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue; const wx = ((tx % n) + n) % n;
    th += `<img src="https://tile.openstreetmap.org/${z}/${wx}/${ty}.png" alt="" loading="lazy" style="left:${tx * TILE - ox}px;top:${ty * TILE - oy}px">`;
  }
  tiles.innerHTML = th;
  // 선
  const loc = ps.map(p => [p[0] - ox, p[1] - oy]);
  const d = loc.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const svg = box.querySelector('.mp-svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<path class="mp-halo" d="${d}"/><path class="mp-line" d="${d}" pathLength="1"/>`;
  // 점: 너무 가까우면 하나로 합쳐 겹치지 않게
  const groups = [];
  loc.forEach((p, i) => { const g = groups.find(g => Math.hypot(g.p[0] - p[0], g.p[1] - p[1]) < 30); if (g) g.n.push(i + 1); else groups.push({ p, n: [i + 1] }); });
  box.querySelector('.mp-dots').innerHTML = groups.map((g, k) => `<span class="mp-dot${g.n.includes(1) ? ' first' : ''}" style="left:${g.p[0]}px;top:${g.p[1]}px;--k:${k}">${g.n.join('·')}</span>`).join('');
}

function mount(root) {
  const boxes = [...root.querySelectorAll('.mp-box')]; if (!boxes.length) return () => { };
  const run = () => boxes.forEach(layout); run();
  let t = 0; const on = () => { clearTimeout(t); t = setTimeout(run, 150); };
  window.addEventListener('resize', on);
  // 화면에 들어오면 선이 그려짐
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.closest('.st-map').classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.35 }) : null;
  boxes.forEach(b => io ? io.observe(b) : b.closest('.st-map').classList.add('in'));
  return () => { window.removeEventListener('resize', on); io && io.disconnect(); };
}

window.RouteMap = { stops, blockHTML, mount, coord, km };
})();
