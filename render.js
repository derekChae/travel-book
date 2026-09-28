// 페이지 그리기 (시안 C · 장면). 모든 위치는 페이지 폭 기준(cqw) → 폰·PC·PDF·발행본이 같은 모습.
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const H = 133.333;
function ymd(d) { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, wd: WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] }; }
const dayLabel = d => { const x = ymd(d); return `${x.m}월 ${x.d}일 ${x.wd}요일`; };
function range(a, b) {
  if (!a) return '';
  const A = ymd(a); if (!b || a === b) return `${A.y}. ${A.m}. ${A.d}`;
  const B = ymd(b); return A.y === B.y ? `${A.y}. ${A.m}. ${A.d} – ${B.m}. ${B.d}` : `${A.y}. ${A.m}. ${A.d} – ${B.y}. ${B.m}. ${B.d}`;
}
const f = n => (+n).toFixed(3) + 'cqw';
function fit(a, maxW, maxH) { let w = maxW, h = w / a; if (h > maxH) { h = maxH; w = h * a; } return { w, h }; }
function capText(p) {
  const d = p.taken ? p.taken.slice(0, 10) : p.assignedDate;
  const bits = [d ? dayLabel(d) : '', p.taken ? p.taken.slice(11, 16) : '', p.place && p.place.name ? p.place.name + (p.place.near ? ' 근처' : '') : ''].filter(Boolean);
  return bits.join(' · ');
}
const paras = t => esc(t).split('\n').filter(s => s.trim()).map(s => `<p>${s}</p>`).join('');

// ctx: { trip, info:{title,start,end,places,countries,count}, photo(id), img(p, kind) -> attr string, edit(bool), issueNo, kind }
function pageHTML(pg, ctx, idx) {
  const P = id => ctx.photo(id);
  const E = ctx.edit;
  const img = (p, x, y, w, h, extra = '') => `<img ${ctx.img(p)} alt="${esc(p.note ? p.note.slice(0, 50) : capText(p))}" style="left:${f(x)};top:${f(y)};width:${f(w)};height:${f(h)}" ${E ? `data-photo="${p.id}" tabindex="0" role="button"` : ''} ${extra}>`;
  const cap = (p, x, y, w, align = 'center') => `<div class="cap" style="left:${f(x)};top:${f(y)};width:${f(w)};text-align:${align}">${esc(capText(p))}</div>`;
  const folio = `<div class="folio">${idx + 1}</div>`;
  const I = ctx.info;
  switch (pg.t) {
    case 'title': {
      const t = I.title; const len = [...t].length;
      const fs = len <= 6 ? 16 : len <= 10 ? 12.5 : len <= 16 ? 9.5 : 7.5;
      return `<section class="pg dark t-title">
        <div class="lab">No.${ctx.issueNo}${I.countries.length ? ' · ' + esc(I.countries.join(' · ')) : ''}</div>
        <div class="tt">
          <h1 style="font-size:${fs}cqw" ${E ? 'data-act="edit-title" role="button" tabindex="0"' : ''}>${esc(t)}</h1>
          <div class="date">${range(I.start, I.end)}${I.places.length ? ' · ' + esc(I.places.slice(0, 3).join(' · ')) : ''}</div>
          ${pg.lede ? `<div class="lede" ${E ? 'data-act="edit-lede" role="button" tabindex="0"' : ''}>${paras(pg.lede)}</div>`
            : E ? `<button class="hint dark" data-act="edit-lede">+ 이 여행 소개 쓰기</button>` : ''}
        </div></section>`;
    }
    case 'bleed': { const p = P(pg.photos[0]); return `<section class="pg t-bleed">${img(p, 0, 0, 100, H)}</section>`; }
    case 'bleedL': case 'bleedR': {
      const p = P(pg.photos[0]); const left = pg.t === 'bleedL' ? 0 : -100;
      return `<section class="pg t-${pg.t}">${img(p, left, 0, 200, H)}</section>`;
    }
    case 'inset': {
      const p = P(pg.photos[0]); const a = Pages.ar(p);
      const { w, h } = fit(a, 72, 90); const x = (100 - w) / 2; const y = 12 + (96 - h) / 2 - 3;
      return `<section class="pg t-inset">${img(p, x, y, w, h)}${cap(p, 14, y + h + 2.5, 72)}${folio}</section>`;
    }
    case 'story': case 'storyWide': {
      const p = P(pg.photos[0]); const a = Pages.ar(p);
      const wide = pg.t === 'storyWide';
      const { w, h } = wide ? fit(a, 84, 56) : fit(a, 60, 58);
      const x = (100 - w) / 2, y = wide ? 10 : 12;
      const ty = y + h + 9;
      return `<section class="pg t-story">${img(p, x, y, w, h)}${cap(p, 10, y + h + 2.3, 80)}
        <div class="body" style="left:${f(18)};top:${f(ty)};width:${f(64)}" ${E ? `data-photo="${p.id}" role="button" tabindex="0"` : ''}>${paras(pg.text)}</div>${folio}</section>`;
    }
    case 'pair': {
      const [p1, p2] = pg.photos.map(P);
      const side = Pages.ar(p1) < 0.9 && Pages.ar(p2) < 0.9;
      let h1 = '';
      if (side) {
        [p1, p2].forEach((p, i) => { const { w, h } = fit(Pages.ar(p), 40, 62); const x = i ? 52 : 8; const y = 24 + (62 - h); h1 += img(p, x + (40 - w) / 2, y, w, h) + cap(p, x, 24 + 62 + 2.3, 40); });
      } else {
        [p1, p2].forEach((p, i) => { const { w, h } = fit(Pages.ar(p), 72, 49); const y = i ? 68 : 10; h1 += img(p, (100 - w) / 2, y + (49 - h), w, h) + cap(p, 14, y + 49 + 1.8, 72); });
      }
      return `<section class="pg t-pair">${h1}${folio}</section>`;
    }
    case 'trio': {
      const [p1, p2, p3] = pg.photos.map(P);
      const A = fit(Pages.ar(p1), 84, 54);
      let s = img(p1, (100 - A.w) / 2, 8 + (54 - A.h), A.w, A.h) + cap(p1, 8, 8 + 54 + 1.8, 84);
      [p2, p3].forEach((p, i) => { const { w, h } = fit(Pages.ar(p), 40, 42); const x = i ? 52 : 8; s += img(p, x + (40 - w) / 2, 72 + (42 - h), w, h) + cap(p, x, 72 + 42 + 1.8, 40); });
      return `<section class="pg t-trio">${s}${folio}</section>`;
    }
    case 'grid': {
      let s = '';
      pg.photos.map(P).forEach((p, i) => { const { w, h } = fit(Pages.ar(p), 40, 46); const x = i % 2 ? 52 : 8; const y = i < 2 ? 10 : 66; s += img(p, x + (40 - w) / 2, y + (46 - h), w, h) + cap(p, x, y + 46 + 1.6, 40); });
      return `<section class="pg t-grid">${s}${folio}</section>`;
    }
    case 'day': {
      const places = ctx.dayPlaces(pg.day);
      return `<section class="pg t-day">
        <div class="num">${pg.dayNo ? String(pg.dayNo).padStart(2, '0') : '–'}</div>
        <div class="dd">${pg.day === 'unknown' ? '날짜 모르는 사진' : dayLabel(pg.day)}</div>
        <div class="dp">${esc(places.join(' · '))}</div>
        ${(() => {
          let top = 42, ph = '';
          if (pg.photo) { const p = P(pg.photo); const { w, h } = fit(Pages.ar(p), 64, 56); ph = img(p, (100 - w) / 2, 40, w, h) + cap(p, 14, 40 + h + 2.3, 72); top = 40 + h + 9; }
          const tx = pg.text ? `<div class="body" style="left:${f(18)};top:${f(top)};width:${f(64)}" ${E ? `data-act="edit-day" data-day="${pg.day}" role="button" tabindex="0"` : ''}>${paras(pg.text)}</div>`
            : E ? `<button class="hint" style="left:${f(18)};top:${f(top)}" data-act="edit-day" data-day="${pg.day}">+ 이날 이야기 쓰기</button>` : '';
          return ph + tx;
        })()}
        ${folio}</section>`;
    }
    case 'text': {
      const act = pg.owner === 'day' ? `data-act="edit-day" data-day="${pg.day}"` : pg.owner === 'lede' ? 'data-act="edit-lede"' : `data-photo="${pg.photo}"`;
      return `<section class="pg t-text"><div class="body" style="left:${f(18)};top:${f(14)};width:${f(64)}" ${E ? act + ' role="button" tabindex="0"' : ''}>${paras(pg.text)}</div>${folio}</section>`;
    }
    case 'end':
      return `<section class="pg t-end"><div class="colo"><div class="lab2">나의 여행책 No.${ctx.issueNo}</div><div class="et">${esc(I.title)}</div><div class="ed">${range(I.start, I.end)} · 사진 ${I.count}장</div></div></section>`;
  }
  return '';
}

// 화면용: 펼침면(PC) / 한 페이지씩(폰). 통째 펼침면 사진은 한 장으로.
function screenHTML(plan, ctx) {
  const pgs = plan.pages; let out = '';
  for (let i = 0; i < pgs.length; i += 2) {
    const a = pgs[i], b = pgs[i + 1];
    if (a.t === 'bleedL') {
      const p = ctx.photo(a.photos[0]);
      out += `<div class="row row-bleed"><div class="sp-bleed"><img ${ctx.img(p)} alt="${esc(capText(p))}" ${ctx.edit ? `data-photo="${p.id}" tabindex="0" role="button"` : ''}></div></div>`;
      continue;
    }
    out += `<div class="row">${pageHTML(a, ctx, i)}${b ? pageHTML(b, ctx, i + 1) : '<div class="pg ghost" aria-hidden="true"></div>'}</div>`;
  }
  return out;
}
// 인쇄·PDF용: 한 장 = 한 페이지
function printHTML(plan, ctx) { return plan.pages.map((pg, i) => pageHTML(pg, ctx, i)).join(''); }

window.Render = { screenHTML, printHTML, pageHTML, capText, dayLabel, range, esc };
})();
