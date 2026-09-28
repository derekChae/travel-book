// 이야기 화면 (Exposure처럼 사진 위주, 세로 스크롤)
// 표지 = 화면 가득. 하이라이트로 체크한 사진 = 화면 가득. 나머지는 화면 폭을 꽉 채우고, 세로 사진은 PC에서 두 장씩.
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = t => esc(t).split('\n').filter(s => s.trim()).map(s => `<p>${s}</p>`).join('');
const ar = p => (p.w && p.h) ? p.w / p.h : 1;
const isHero = p => !!(p.hero || p.layout === 'big');

// 사진 흐름 짜기 (찍은 순서 그대로)
function blocks(photos) {
  const out = []; let i = 0;
  while (i < photos.length) {
    const p = photos[i], n = photos[i + 1];
    if (isHero(p)) { out.push({ t: 'full', ps: [p] }); i++; continue; }
    if (p.note) { out.push({ t: 'story', ps: [p] }); i++; continue; }
    if (p.layout === 'small') {
      const run = []; while (i < photos.length && photos[i].layout === 'small' && !photos[i].note && !isHero(photos[i])) run.push(photos[i++]);
      out.push({ t: 'grid', ps: run }); continue;
    }
    if (ar(p) >= 1.15) { out.push({ t: 'wide', ps: [p] }); i++; continue; }
    // 세로·정사각: 다음 것도 세로·정사각이면 두 장 나란히 (PC), 폰에선 한 장씩 크게
    if (n && !isHero(n) && !n.note && n.layout !== 'small' && ar(n) < 1.15) { out.push({ t: 'duo', ps: [p, n] }); i += 2; continue; }
    out.push({ t: 'tall', ps: [p] }); i++;
  }
  return out;
}

// ctx: { info, trip, issueNo, img(p, role) -> attrs, edit, dayPlaces(d), shown, cover }
function storyHTML(ctx) {
  const { info, trip: t, edit: E } = ctx;
  const cap = p => Render.capText(p);
  const tapP = p => E ? `data-photo="${p.id}" role="button" tabindex="0"` : '';
  const star = p => E && isHero(p) ? '<span class="st-badge">화면 가득</span>' : '';
  const pos = p => p.focus ? `object-position:${p.focus.x}% ${p.focus.y}%` : '';
  const fig = (p, cls = '', role = 'body') => `<figure class="st-fig ${cls}">${star(p)}<img ${ctx.img(p, role)} alt="${esc(p.note ? p.note.slice(0, 60) : cap(p))}" ${tapP(p)} style="aspect-ratio:${(p.w || 1)}/${(p.h || 1)}"><figcaption>${esc(cap(p))}</figcaption></figure>`;
  const cover = ctx.cover;
  let h = `<article class="st">
  <header class="st-cover ${cover ? '' : 'no-photo'}">
    ${cover ? `<img class="st-cover-img" ${ctx.img(cover, 'hero')} alt="" ${tapP(cover)} style="${pos(cover)}">` : ''}
    <div class="st-cover-tx">
      <div class="st-kicker">나의 여행책 No.${ctx.issueNo}${info.countries.length ? ' · ' + esc(info.countries.join(' · ')) : ''}</div>
      <h1 ${E ? 'data-act="edit-title" role="button" tabindex="0"' : ''}>${esc(info.title)}</h1>
      <div class="st-meta">${Render.range(info.start, info.end)}${info.places.length ? ' · ' + esc(info.places.slice(0, 3).join(' · ')) : ''}</div>
    </div>
  </header>`;
  if (t.lede) h += `<section class="st-text st-lede" ${E ? 'data-act="edit-lede" role="button" tabindex="0"' : ''}>${paras(t.lede)}</section>`;
  else if (E) h += `<section class="st-text"><button class="st-hint" data-act="edit-lede">어떤 여행이었는지 한두 줄로 남겨보세요. 말로 해도 돼요.</button></section>`;

  const days = new Map();
  ctx.shown.forEach(p => { if (cover && p.id === cover.id && !p.note) return; const k = App.dayKey(p) || 'unknown'; if (!days.has(k)) days.set(k, []); days.get(k).push(p); });
  const keys = [...days.keys()].sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b));
  const multi = keys.length > 1;
  keys.forEach(k => {
    const note = (t.dayNotes || {})[k];
    const no = k === 'unknown' ? '' : String(Meta.dayDiff(info.start, k) + 1).padStart(2, '0');
    if (multi || note || E) {
      h += `<section class="st-day">
        ${multi ? `<div class="st-day-no">${no ? 'DAY ' + no : '날짜 모름'}</div>` : ''}
        <h2>${k === 'unknown' ? '날짜 모르는 사진' : Render.dayLabel(k)}</h2>
        ${ctx.dayPlaces(k).length ? `<div class="st-day-pl">${esc(ctx.dayPlaces(k).join(' · '))}</div>` : ''}
        ${note ? `<div class="st-text st-daynote" ${E ? `data-act="edit-day" data-day="${k}" role="button" tabindex="0"` : ''}>${paras(note)}</div>`
          : E ? `<button class="st-hint" data-act="edit-day" data-day="${k}">이날 있었던 일을 남겨보세요.</button>` : ''}
      </section>`;
    }
    for (const b of blocks(days.get(k))) {
      const p = b.ps[0];
      if (b.t === 'full') h += `<section class="st-full">${star(p)}<img ${ctx.img(p, 'hero')} alt="${esc(cap(p))}" ${tapP(p)} style="${pos(p)}"></section><div class="st-full-cap">${esc(cap(p))}</div>${p.note ? `<section class="st-text" ${tapP(p)}>${paras(p.note)}</section>` : ''}`;
      else if (b.t === 'wide') h += fig(p, 'st-wide');
      else if (b.t === 'tall') h += fig(p, 'st-tall');
      else if (b.t === 'duo') h += `<div class="st-duo">${fig(b.ps[0])}${fig(b.ps[1])}</div>`;
      else if (b.t === 'grid') h += `<div class="st-grid">${b.ps.map(q => fig(q)).join('')}</div>`;
      else if (b.t === 'story') h += `${fig(p, ar(p) >= 1.15 ? 'st-wide' : 'st-tall')}<section class="st-text" ${tapP(p)}>${paras(p.note)}</section>`;
    }
  });
  h += `<footer class="st-end"><div class="st-end-t">${esc(info.title)}</div><div>${Render.range(info.start, info.end)} · 사진 ${ctx.shown.length}장</div><div class="st-end-b">나의 여행책</div></footer></article>`;
  return h;
}

window.Story = { storyHTML, blocks, isHero };
})();
