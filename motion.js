// 이야기 화면의 현장감: 영상 재생, 뷰파인더(시간·장소), 사진 색으로 물드는 배경, 밀착 인화지 이동
(() => {
const WDE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
let cleanup = [];
const off = () => { cleanup.forEach(f => f()); cleanup = []; };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadVideo(v) {
  if (v.dataset.ready) return; v.dataset.ready = '1';
  const poster = await App.urlFor(v.dataset.key); if (poster) v.poster = poster;
  const src = await App.urlFor(v.dataset.vkey);
  if (!src) { v.dataset.ready = ''; v.closest('.is-vid')?.classList.add('need-perm'); return; }
  v.closest('.is-vid')?.classList.remove('need-perm');
  v.src = src;
  // 긴 영상은 고른 장면부터 6초만 반복
  const p = App.S.photos.find(x => x.id === v.dataset.vid);
  if (p && p.clip) {
    const s = p.clip.start, e = s + 6;
    v.addEventListener('loadedmetadata', () => { v.currentTime = s; }, { once: true });
    v.addEventListener('timeupdate', () => { if (v.currentTime > e || v.currentTime < s - 0.5) v.currentTime = s; });
  }
}
// 권한 다시 받기 (누를 때만 가능)
async function withPermission(fn) { App.askPermission = true; try { return await fn(); } finally { App.askPermission = false; } }

// 영상에서 장면 n개 뽑기
async function frames(id, n = 8) {
  const url = await withPermission(() => App.urlFor(id + ':video')); if (!url) return null;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(res, 10000); });
  const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1; const out = [];
  const draw = (max, q) => { const s = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight)); const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return new Promise(r => c.toBlob(r, 'image/jpeg', q)); };
  for (let i = 0; i < n; i++) {
    const t = d * (i + 0.5) / n;
    await new Promise(res => { v.onseeked = res; v.currentTime = t; setTimeout(res, 3000); });
    const small = await draw(480, 0.8), big = await draw(2400, 0.9);
    out.push({ t, small, big, url: URL.createObjectURL(small), w: v.videoWidth, h: v.videoHeight });
  }
  return out;
}


// ----- 현장음: 영상에서 소리만 꺼내, 가까운 시간의 사진을 볼 때 은은하게 -----
const AMB_VOL = 0.35;
const amb = { on: false, players: new Map(), want: null, raf: 0 };
function ambSource(el) {
  if (!el) return null;
  const p = App.S.photos.find(x => x.id === el.dataset.m); if (!p) return null;
  if (p.kind === 'video') return p.id;
  if (!p.taken) return null;
  const t = Meta.absTime(p), day = App.dayKey(p);
  let best = null, bd = Infinity;
  for (const v of App.S.photos) {
    if (v.kind !== 'video' || v.tripId !== p.tripId || !v.taken || App.dayKey(v) !== day) continue;
    const dd = Math.abs(Meta.absTime(v) - t); if (dd < bd) { bd = dd; best = v; }
  }
  return best && bd <= 2 * 3600e3 ? best.id : null;
}
async function ambPlayer(id) {
  if (amb.players.has(id)) return amb.players.get(id);
  const a = new Audio(); a.loop = true; a.preload = 'auto'; a.volume = 0;
  const rec = { a, target: 0, ready: false }; amb.players.set(id, rec);
  const u = await App.urlFor(id + ':video'); if (!u) return rec;
  a.src = u; const p = App.S.photos.find(x => x.id === id);
  a.addEventListener('loadedmetadata', () => { if (p && p.clip) a.currentTime = p.clip.start; }, { once: true });
  rec.ready = true; return rec;
}
function ambTick() {
  amb.raf = 0; let moving = false;
  for (const [, r] of amb.players) {
    const d = r.target - r.a.volume;
    if (Math.abs(d) > 0.01) { r.a.volume = Math.max(0, Math.min(1, r.a.volume + Math.sign(d) * 0.02)); moving = true; }
    else { r.a.volume = r.target; if (r.target === 0 && !r.a.paused) r.a.pause(); }
  }
  if (moving) amb.raf = requestAnimationFrame(ambTick);
}
async function ambSet(id) {
  if (!amb.on || document.querySelector('.vplayer')) id = null;
  if (id === amb.want) return; amb.want = id;
  for (const [k, r] of amb.players) if (k !== id) r.target = 0;
  if (id) { const r = await ambPlayer(id); if (amb.want !== id) return; r.target = AMB_VOL; if (r.ready && r.a.paused) r.a.play().catch(() => { }); }
  document.querySelectorAll('.vf').forEach(v => v.classList.toggle('snd', !!id));
  if (!amb.raf) amb.raf = requestAnimationFrame(ambTick);
}
function ambStop() { amb.want = null; for (const [, r] of amb.players) { r.a.pause(); r.a.removeAttribute('src'); } amb.players.clear(); }

// ----- 크게 보기 (소리와 함께) -----
function openPlayer(id, { edit } = {}) {
  const p = App.S.photos.find(x => x.id === id); if (!p) return;
  document.querySelectorAll('video.st-v').forEach(v => v.pause());
  const el = document.createElement('div'); el.className = 'vplayer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '영상 보기');
  el.innerHTML = `<video controls autoplay playsinline></video><div class="vp-bar"><button class="vp-close">닫기</button><span class="vp-cap">${App.esc(Render.capText(p))}</span>${edit ? '<button class="vp-edit">편집</button>' : ''}</div>`;
  document.body.appendChild(el);
  const v = el.querySelector('video');
  withPermission(() => App.urlFor(p.id + ':video')).then(u => { if (!u) { el.querySelector('.vp-cap').textContent = '원본 영상을 열 수 없어요. 폰에서 지워졌거나 카메라 폴더 연결이 끊겼어요.'; return; } v.src = u; if (p.clip) v.currentTime = p.clip.start; v.play().catch(() => { }); });
  ambSet(null);
  const close = () => { v.pause(); el.remove(); document.removeEventListener('keydown', key); window.dispatchEvent(new Event('scroll')); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  el.querySelector('.vp-close').addEventListener('click', close);
  el.querySelector('.vp-edit')?.addEventListener('click', () => { close(); window.Actions && Actions.openPhoto(p.id); });
  el.querySelector('.vp-close').focus();
}

function mount(root, { trip } = {}) {
  off(); if (!root) return;
  if (window.RouteMap) cleanup.push(RouteMap.mount(root));
  const ambBtn = document.querySelector('[data-act="amb"]');
  const setBtn = () => { if (ambBtn) { ambBtn.setAttribute('aria-pressed', amb.on); ambBtn.textContent = amb.on ? '현장음 끄기' : '현장음'; } };
  setBtn();
  const onAmb = e => { if (!e.target.closest('[data-act="amb"]')) return; amb.on = !amb.on; setBtn(); if (amb.on) { App.toast('현장음을 켰어요. 영상에서 가져온 소리가 가까운 시간의 사진에 흘러요.', 3500); window.dispatchEvent(new Event('scroll')); } else ambSet(null); };
  document.addEventListener('click', onAmb);
  cleanup.push(() => { document.removeEventListener('click', onAmb); ambStop(); });
  const edit = !!root.closest('[data-trip]');

  // ----- 영상: 보이면 소리 없이 재생, 벗어나면 멈춤 -----
  const vids = [...root.querySelectorAll('video.st-v')];
  if (vids.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(async e => {
      const v = e.target;
      if (e.isIntersecting) { await loadVideo(v); if (!reduce() && e.intersectionRatio >= 0.35 && !document.querySelector('.vplayer')) v.play().catch(() => { }); else v.pause(); }
      else v.pause();
    }), { threshold: [0, 0.35, 0.7], rootMargin: '300px 0px' });
    vids.forEach(v => io.observe(v)); cleanup.push(() => io.disconnect());
  }
  const onClick = e => {
    const b = e.target.closest('[data-play]') || e.target.closest('video.st-v');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const box = b.closest('.is-vid');
      if (box && box.classList.contains('need-perm')) { withPermission(async () => { const v = box.querySelector('video.st-v'); v.dataset.ready = ''; await loadVideo(v); if (v.src) v.play().catch(() => { }); }); return; }
      openPlayer(b.dataset.play || b.dataset.vid, { edit }); return;
    }
    const j = e.target.closest('[data-jump]');
    if (j) {
      const t = root.querySelector(`[data-m="${j.dataset.jump}"]`);
      const y = t ? t.getBoundingClientRect().top + scrollY - 40 : 0;
      window.scrollTo({ top: y, behavior: reduce() ? 'auto' : 'smooth' });
    }
  };
  root.addEventListener('click', onClick, true);
  cleanup.push(() => root.removeEventListener('click', onClick, true));

  // ----- 사진 색이 없는 예전 사진은 조용히 계산해 저장 -----
  (async () => {
    for (const el of root.querySelectorAll('[data-m]:not([data-tone])')) {
      const p = App.S.photos.find(x => x.id === el.dataset.m); if (!p) continue;
      try {
        const img = new Image(); img.src = await App.urlFor(p.id + ':thumb'); await img.decode();
        p.tone = Meta.toneOf(img); if (!p.tone) continue;
        await DB.putPhoto(p); root.querySelectorAll(`[data-m="${p.id}"]`).forEach(x => x.dataset.tone = p.tone.join(','));
      } catch { }
    }
  })();

  // ----- 뷰파인더 + 배경색 -----
  const vf = root.querySelector('.vf');
  if (vf && !vf.querySelector('.vf-snd')) vf.insertAdjacentHTML('beforeend', '<span class="vf-snd" aria-hidden="true"><i></i><i></i><i></i></span>');
  const medias = () => [...root.querySelectorAll('[data-m]')];
  const blockers = [...root.querySelectorAll('.st-map, .st-text, .st-day, .st-contact, .st-end, .st-cover-tx, .st-hint, figcaption, .st-full-cap, .st-badge, .st-play, .st-vtag')];
  const coverTone = root.querySelector('.st-cover')?.dataset.tone;
  const setTone = t => { if (t) root.style.setProperty('--amb', t.split(',').join(' ')); };
  setTone(coverTone);
  let last = '', raf = 0;
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
  const fx = () => {
    raf = 0;
    const cy = innerHeight * 0.55;
    let cur = null, lastAbove = null;
    for (const m of medias()) { const r = m.getBoundingClientRect(); if (r.top < cy) lastAbove = m; if (r.top <= cy && r.bottom >= cy) cur = m; }
    setTone((lastAbove && lastAbove.dataset.tone) || coverTone);
    if (amb.on) { const endR = root.querySelector('.st-contact')?.getBoundingClientRect(); ambSet(endR && endR.top < cy ? null : ambSource(cur || lastAbove)); }
    if (!vf) return;
    let show = !!(cur && (cur.dataset.t || cur.dataset.pl));
    if (show) {
      const d = cur.dataset.d; let ds = '';
      if (d && d !== 'unknown') { const [y, mo, dd] = d.split('-').map(Number); ds = `${String(mo).padStart(2, '0')}.${String(dd).padStart(2, '0')} ${WDE[new Date(Date.UTC(y, mo - 1, dd)).getUTCDay()]}`; }
      const key = ds + cur.dataset.t + cur.dataset.pl;
      if (key !== last) {
        vf.querySelector('.vf-d').textContent = ds; vf.querySelector('.vf-t').textContent = cur.dataset.t || '';
        vf.querySelector('.vf-p').textContent = cur.dataset.pl || ''; vf.querySelector('.vf-p').hidden = !cur.dataset.pl;
        if (last && !reduce()) { vf.classList.remove('tick'); void vf.offsetWidth; vf.classList.add('tick'); }
        last = key;
      }
      // 글·버튼과 겹치면 숨김
      vf.classList.add('on');
      // 움직이는 중이어도 도착할 자리로 검사
      const cur0 = vf.getBoundingClientRect(); const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
      const bottom = innerHeight - (document.body.classList.contains('chrome-hidden') ? 18 : 84) - safe;
      const r = { left: cur0.left, right: cur0.right, top: bottom - cur0.height - 6, bottom: bottom + 6 };
      const dock = document.querySelector('.fdock');
      const top = document.getElementById('top');
      if (blockers.some(b => hit(r, b.getBoundingClientRect())) || (dock && hit(r, dock.getBoundingClientRect())) || (top && hit(r, top.getBoundingClientRect()))) show = false;
    }
    vf.classList.toggle('on', show);
  };
  let settle = 0;
  const on = () => { if (!raf) raf = requestAnimationFrame(fx); clearTimeout(settle); settle = setTimeout(fx, 340); };
  window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
  const onEnd = () => on(); vf && vf.addEventListener('transitionend', onEnd);
  const mo = new MutationObserver(on); mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  cleanup.push(() => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); vf && vf.removeEventListener('transitionend', onEnd); mo.disconnect(); clearTimeout(settle); if (raf) cancelAnimationFrame(raf); });
  fx();
}

window.Motion = { mount, off, openPlayer, frames, amb, ambSource };
})();
