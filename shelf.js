// 책장 모션: 카드 쌓기(스크롤), 나타나기, 목록에서 커서 따라오는 표지, 보기 전환
(() => {
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let cleanup = [];
function off() { cleanup.forEach(f => f()); cleanup = []; }

function mountStack(root, quiet) {
  const cards = [...root.querySelectorAll('.stack .card')];
  if (!cards.length) return;
  // 나타나기
  if (quiet || reduce() || !('IntersectionObserver' in window)) cards.forEach(c => c.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    cards.forEach(c => io.observe(c)); cleanup.push(() => io.disconnect());
  }
  // 다음 카드가 덮을수록 뒤 카드가 작아지고 어두워짐
  if (reduce()) return;
  let raf = 0;
  const fx = () => {
    raf = 0;
    for (let i = 0; i < cards.length; i++) {
      const next = cards[i + 1]; let p = 0;
      if (next) { const r = cards[i].getBoundingClientRect(), n = next.getBoundingClientRect(); p = Math.min(1, Math.max(0, (r.bottom - n.top) / r.height)); }
      cards[i].style.setProperty('--p', p.toFixed(3));
    }
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(fx); };
  window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
  cleanup.push(() => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); });
  fx();
}

function mountIndex(root) {
  const fl = root.querySelector('.ix-float'); if (!fl) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches;
  if (!fine) return;
  const img = fl.querySelector('img');
  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, raf = 0, live = false, lastKey = '';
  const tick = () => {
    // 글자와 겹치지 않게 오른쪽 빈 자리에 두고, 세로만 커서를 따라감
    const w = fl.offsetWidth, h = fl.offsetHeight;
    tx = innerWidth - w / 2 - innerWidth * 0.04;
    const ty2 = Math.min(innerHeight - h / 2 - 16, Math.max(h / 2 + 64, ty));
    const dy = ty2 - y; x += (tx - x) * 0.14; y += dy * 0.14;
    const rot = Math.max(-6, Math.min(6, dy * -0.05));
    const dx = dy;
    fl.style.transform = `translate(${x - fl.offsetWidth / 2}px, ${y - fl.offsetHeight / 2}px) rotate(${reduce() ? 0 : rot}deg)`;
    raf = live || Math.abs(dx) > 0.5 ? requestAnimationFrame(tick) : 0;
  };
  const move = e => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(tick); };
  const over = async e => {
    const row = e.target.closest('.ix-row'); if (!row) return;
    live = true; fl.classList.add('on');
    const key = row.dataset.cover; if (!key || key === lastKey) return; lastKey = key;
    const u = await App.urlFor(key); if (u && lastKey === key) { img.classList.remove('sw'); void img.offsetWidth; img.src = u; img.classList.add('sw'); }
  };
  const leave = () => { live = false; fl.classList.remove('on'); };
  const list = root.querySelector('.ix');
  window.addEventListener('mousemove', move, { passive: true });
  list.addEventListener('mouseover', over); list.addEventListener('mouseleave', leave);
  cleanup.push(() => { window.removeEventListener('mousemove', move); if (raf) cancelAnimationFrame(raf); });
}

function mount(root, { quiet } = {}) {
  off();
  mountStack(root, quiet);
  mountIndex(root);
  root.querySelectorAll('[data-shelf]').forEach(b => b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return;
    localStorage.setItem('shelfMode', b.dataset.shelf);
    const swap = () => { App.renderHome({ quiet: true, fresh: true }); window.scrollTo(0, 0); };
    if (document.startViewTransition && !reduce()) document.startViewTransition(swap); else swap();
  }));
}

window.Shelf = { mount, off };
})();
