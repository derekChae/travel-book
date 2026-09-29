// 이야기 화면의 현장감: 영상 재생, 뷰파인더(시간·장소), 사진 색으로 물드는 배경, 밀착 인화지 이동
(() => {
const WDE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
let cleanup = [];
const off = () => { cleanup.forEach(f => f()); cleanup = []; };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadVideo(v) {
  if (v.dataset.ready) return; v.dataset.ready = '1';
  const poster = await App.urlFor(v.dataset.key); if (poster) v.poster = poster;
  const src = await App.urlFor(v.dataset.vkey); if (src) v.src = src;
}

// ----- 크게 보기 (소리와 함께) -----
function openPlayer(id, { edit } = {}) {
  const p = App.S.photos.find(x => x.id === id); if (!p) return;
  document.querySelectorAll('video.st-v').forEach(v => v.pause());
  const el = document.createElement('div'); el.className = 'vplayer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '영상 보기');
  el.innerHTML = `<video controls autoplay playsinline></video><div class="vp-bar"><button class="vp-close">닫기</button><span class="vp-cap">${App.esc(Render.capText(p))}</span>${edit ? '<button class="vp-edit">편집</button>' : ''}</div>`;
  document.body.appendChild(el);
  const v = el.querySelector('video');
  App.urlFor(p.id + ':video').then(u => { v.src = u; v.play().catch(() => { }); });
  const close = () => { v.pause(); el.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  el.querySelector('.vp-close').addEventListener('click', close);
  el.querySelector('.vp-edit')?.addEventListener('click', () => { close(); window.Actions && Actions.openPhoto(p.id); });
  el.querySelector('.vp-close').focus();
}

function mount(root, { trip } = {}) {
  off(); if (!root) return;
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
    if (b) { e.preventDefault(); e.stopPropagation(); openPlayer(b.dataset.play || b.dataset.vid, { edit }); return; }
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
  const medias = () => [...root.querySelectorAll('[data-m]')];
  const blockers = [...root.querySelectorAll('.st-text, .st-day, .st-contact, .st-end, .st-cover-tx, .st-hint, figcaption, .st-full-cap, .st-badge, .st-play, .st-vtag')];
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
      const r = vf.getBoundingClientRect();
      const dock = document.querySelector('.fdock');
      const top = document.getElementById('top');
      if (blockers.some(b => hit(r, b.getBoundingClientRect())) || (dock && hit(r, dock.getBoundingClientRect())) || (top && hit(r, top.getBoundingClientRect()))) show = false;
    }
    vf.classList.toggle('on', show);
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(fx); };
  window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
  cleanup.push(() => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); });
  fx();
}

window.Motion = { mount, off, openPlayer };
})();
