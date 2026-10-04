// 이야기 화면 (Exposure처럼 사진 위주, 세로 스크롤)
// 표지 = 화면 가득. 하이라이트로 체크한 사진 = 화면 가득. 나머지는 화면 폭을 꽉 채우고, 세로 사진은 PC에서 두 장씩.
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = t => esc(t).split('\n').filter(s => s.trim()).map(s => `<p>${s}</p>`).join('');
const ar = p => (p.w && p.h) ? p.w / p.h : 1;
const isHero = p => !!(p.hero || p.layout === 'big');
const isVid = p => p.kind === 'video';
const dur = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const tone = p => p.tone ? `data-tone="${p.tone.join(',')}"` : '';
const stamp = p => { const d = App.dayKey(p); const c = window.RouteMap && RouteMap.coord(p); return `data-t="${p.taken ? p.taken.slice(11, 16) : ''}" data-d="${d || ''}" data-pl="${esc(p.place && p.place.name || '')}"${c ? ` data-ll="${c[0]},${c[1]}"` : ''}${p.moveBy ? ` data-mv="${esc(p.moveBy.by)}"` : ''}`; };

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
  const canVid = p => isVid(p) && ctx.videos !== false;
  // 영상: 화면에 보이면 소리 없이 재생, 누르면 소리와 함께 크게
  const media = (p, role, extra = '') => canVid(p) && !p.posterOnly
    ? `<video class="st-v" ${ctx.img(p, role).replace(/\bsrc=/, 'data-poster=')} data-vkey="${p.id}:video" data-vid="${p.id}" muted playsinline loop preload="none" ${extra}></video><button class="st-play" data-play="${p.id}" aria-label="소리 켜고 보기"><span class="pl-i" aria-hidden="true"></span>${p.preview ? '미리보기' : dur(p.duration)}</button>`
    : `<img ${ctx.img(p, role)} alt="${esc(p.note ? p.note.slice(0, 60) : cap(p))}" ${tapP(p)} ${extra}>${isVid(p) ? `<span class="st-vtag">영상 ${dur(p.duration)}</span>` : ''}`;
  const fig = (p, cls = '', role = 'body') => `<figure class="st-fig ${cls}${isVid(p) ? ' is-vid' : ''}" data-m="${p.id}" ${stamp(p)} ${tone(p)}>${star(p)}${media(p, role, `style="aspect-ratio:${(p.w || 1)}/${(p.h || 1)}"`)}<figcaption>${esc(cap(p))}</figcaption></figure>`;
  const cover = ctx.cover;
  const shot = (p, cls = '') => {
    const pan = ar(p) >= 1.15 && !isVid(p) ? ' st-pan' : '';
    const ov = `<div class="st-ov">${esc(cap(p))}</div>`;
    // 세로 사진 한 장: PC에서는 같은 사진을 어둡게 크게 깔고 그 위에 사진 전체를 (빈 곳 없이 화면을 채움)
    if (cls === 'spread') return `<section class="st-full st-shot st-spread${isVid(p) ? ' is-vid' : ''}" data-m="${p.id}" ${stamp(p)} ${tone(p)}><img class="sp-bg" ${ctx.img(p, 'thumb')} alt="" aria-hidden="true">${star(p)}<div class="sp-ph">${media(p, 'hero', `style="${pos(p)}"`)}</div>${ov}</section>`;
    return `<section class="st-full st-shot ${cls}${pan}${isVid(p) ? ' is-vid' : ''}" data-m="${p.id}" ${stamp(p)} ${tone(p)}>${star(p)}${media(p, 'hero', `style="${pos(p)}"`)}${ov}</section>`;
  };
  const rimg = (list) => (id, role = 'thumb') => { const p = list.find(q => q.id === id) || { id }; const st = [role === 'body' && p.w && p.h ? `aspect-ratio:${p.w}/${p.h}` : '', p.focus ? `object-position:${p.focus.x}% ${p.focus.y}%` : ''].filter(Boolean).join(';'); return ctx.img(p, role) + (st ? ` style="${st}"` : ''); };
  const sty = t.style || {};
  let h = `<article class="st" data-font="${esc(sty.font || 'maru')}" data-size="${esc(sty.size || 'm')}">
  <header class="st-cover ${cover ? '' : 'no-photo'}" ${cover ? tone(cover) : ''}>
    ${cover ? (canVid(cover) ? `<video class="st-cover-img st-v" ${ctx.img(cover, 'hero').replace(/\bsrc=/, 'data-poster=')} data-vkey="${cover.id}:video" data-vid="${cover.id}" muted playsinline loop preload="none" style="${pos(cover)}"></video>` : `<img class="st-cover-img" ${ctx.img(cover, 'hero')} alt="" ${tapP(cover)} style="${pos(cover)}">`) : ''}
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
      // 모든 사진이 화면 한 장을 꽉 채움 (매거진). 가로 사진은 폰에서 스크롤에 따라 옆으로 흘러가며 전체를 보여줌
      if (b.t === 'duo') h += `<div class="st-pair">${shot(b.ps[0], 'half')}${shot(b.ps[1], 'half')}</div>`;
      else if (b.t === 'tall' && ar(p) < 0.9) h += shot(p, 'spread');
      else if (b.t === 'grid') h += b.ps.map(q => shot(q)).join('');
      else h += shot(p);
      if (p.note && b.t !== 'duo' && b.t !== 'grid') h += `<section class="st-text" ${tapP(p)}>${paras(p.note)}</section>`;
    }
  });
  // 엔딩: 밀착 인화지 (이 여행의 모든 컷을 필름처럼)
  const all = ctx.shown;
  const nPhoto = all.filter(p => !isVid(p)).length, nVid = all.length - nPhoto;
  const timed = all.filter(p => p.taken);
  const md = p => `${+p.taken.slice(5, 7)}.${+p.taken.slice(8, 10)} ${p.taken.slice(11, 16)}`;
  const dayCount = new Set(all.map(p => App.dayKey(p)).filter(Boolean)).size;
  const facts = [dayCount ? `${dayCount}일` : '', `사진 ${nPhoto}장`, nVid ? `영상 ${nVid}개` : '', timed.length ? `첫 컷 ${md(timed[0])}` : '', timed.length > 1 ? `마지막 컷 ${md(timed[timed.length - 1])}` : ''].filter(Boolean);
  h += `<section class="st-contact">
    <div class="cs-head"><span>밀착 인화지</span><span>${all.length}컷</span></div>
    <div class="cs-strip">${all.map((p, i) => `<button class="cs-f" data-jump="${p.id}"><img ${ctx.img(p, 'thumb')} alt=""><span class="cs-n">${String(i + 1).padStart(2, '0')}${isVid(p) ? ' ▶' : ''}</span><span class="cs-t">${p.taken ? p.taken.slice(5, 10).replace('-', '.') + ' ' + p.taken.slice(11, 16) : ''}</span></button>`).join('')}</div>
    <div class="cs-facts">${facts.map(esc).join(' · ')}</div>
  </section>
  <footer class="st-end"><div class="st-end-t">${esc(info.title)}</div><div>${Render.range(info.start, info.end)}${info.places.length ? ' · ' + esc(info.places.slice(0, 3).join(' · ')) : ''}</div><div class="st-end-b">나의 여행책</div>${window.RouteMap && all.some(p => RouteMap.coord(p)) ? '<div class="st-end-b">지도 © OpenFreeMap · © OpenMapTiles · © OpenStreetMap</div>' : ''}</footer>
  <div class="vf" aria-hidden="true"><span class="vf-map" hidden><span class="vf-mapc"></span><i class="vf-me"></i></span><span class="vf-txt"><span class="vf-l1"><span class="vf-rec"></span><span class="vf-d"></span><span class="vf-t"></span></span><span class="vf-mvl"></span><span class="vf-p"></span></span></div></article>`;
  return h;
}

window.Story = { storyHTML, blocks, isHero, isVid, dur };
})();
