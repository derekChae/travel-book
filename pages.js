// 페이지 엔진 (시안 C · 장면)
// 사진 비율·개수·글 유무로 페이지 틀을 고른다. 같은 입력이면 항상 같은 결과. 사진 순서는 찍은 순서 그대로.
// 페이지 = 3:4. 펼침면 = 페이지 2장(3:2).
(() => {
const ar = p => (p.w && p.h) ? p.w / p.h : 1;
const SPREAD = [1.4, 1.62];   // 이 비율이면 펼침면 통째로 (잘림 7% 이내)
const PAGE = [0.7, 0.8];      // 이 비율이면 한 페이지 통째로
const isSpreadAr = p => ar(p) >= SPREAD[0] && ar(p) <= SPREAD[1];
const isPageAr = p => ar(p) >= PAGE[0] && ar(p) <= PAGE[1];
const BURST_MS = 20000;       // 20초 안에 연달아 찍은 사진은 비슷한 사진으로 묶음

// ----- 비슷한 사진(연사) 묶기 -----
function groupBursts(sorted) {
  const groups = []; let cur = null, lastT = null;
  for (const p of sorted) {
    const t = Meta.absTime(p);
    if (cur && t != null && lastT != null && t - lastT <= BURST_MS) cur.push(p); else { cur = [p]; groups.push(cur); }
    lastT = t;
  }
  return groups;
}
// 보여줄 사진 고르기: 묶음마다 대표 1장(글이 있거나 '보이기'한 사진은 항상 보임)
function visiblePhotos(sorted) {
  const shown = [], hiddenBy = new Map();
  for (const g of groupBursts(sorted)) {
    const rep = g.find(p => p.note) || g.find(p => p.show) || g[0];
    for (const p of g) {
      if (p.hidden) continue;
      if (p === rep || p.note || p.show) shown.push(p);
      else hiddenBy.set(p.id, rep.id);
    }
  }
  return { shown, hiddenBy };
}

// ----- 긴 글 나누기 (문장 단위) -----
function chunkText(text, first, rest) {
  const t = (text || '').trim(); if (!t) return [];
  const parts = t.split(/(?<=[.!?。…」"'”])\s+|\n+/).filter(Boolean);
  const out = []; let cur = '', cap = first;
  for (const s of parts) {
    const add = (cur ? (t.includes('\n' + s) ? '\n' : ' ') : '') + s;
    if (cur && (cur + add).length > cap) { out.push(cur); cur = s; cap = rest; }
    else cur += add;
  }
  if (cur) out.push(cur);
  // 한 문장이 너무 길면 강제로 자름
  return out.flatMap(c => { const r = []; let x = c; const lim = Math.max(first, rest) * 1.25; while (x.length > lim) { r.push(x.slice(0, lim)); x = x.slice(lim); } r.push(x); return r; });
}
const CAP = { day: 440, text: 560, story: 220, storyWide: 280, lede: 150 };

// ----- 한 권 계획 -----
function plan(trip, photos) {
  const sorted = Meta.sortPhotos(photos);
  const { shown, hiddenBy } = visiblePhotos(sorted);
  const no = new Map(); shown.forEach((p, i) => no.set(p.id, i + 1));
  const pages = [];
  const push = pg => pages.push(pg);
  const atLeft = () => pages.length % 2 === 0;

  // 표지 사진
  const cover = shown.find(p => p.id === trip.coverId) || shown.find(isSpreadAr) || shown.find(isPageAr) || shown[0] || null;
  const ledeChunks = chunkText(trip.lede, CAP.lede, CAP.text);

  // 여는 펼침면
  if (cover && isSpreadAr(cover)) {
    push({ t: 'bleedL', photos: [cover.id] }); push({ t: 'bleedR', photos: [cover.id] });
    push({ t: 'title', lede: ledeChunks[0] || '' });
  } else {
    push({ t: 'title', lede: ledeChunks[0] || '' });
    if (cover) push({ t: isPageAr(cover) ? 'bleed' : 'inset', photos: [cover.id] });
  }
  ledeChunks.slice(1).forEach(c => push({ t: 'text', text: c, owner: 'lede' }));
  if (cover && cover.note) chunkText(cover.note, CAP.text, CAP.text).forEach(c => push({ t: 'text', text: c, owner: 'photo', photo: cover.id }));

  // 날짜별
  const days = new Map();
  shown.forEach(p => { if (cover && p.id === cover.id) return; const k = Meta.dayOf(p) || p.assignedDate || 'unknown'; if (!days.has(k)) days.set(k, []); days.get(k).push(p); });
  const dayKeys = [...days.keys()].sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b));
  const allDays = [...new Set(shown.map(p => Meta.dayOf(p) || p.assignedDate).filter(Boolean))].sort();
  const startDay = allDays[0];
  const multiDay = allDays.length > 1 || dayKeys.includes('unknown');

  for (const k of dayKeys) {
    const note = (trip.dayNotes || {})[k];
    const noteChunks = chunkText(note, CAP.day, CAP.text);
    const dps = days.get(k);
    const lone = dps.length === 1 ? dps[0] : null;
    const loneSmall = lone && !lone.note && lone.layout !== 'big' && (lone.layout === 'small' || (!isSpreadAr(lone) && !isPageAr(lone)));
    if (multiDay && loneSmall && (note || '').trim().length <= 140) {
      // 사진 한 장뿐인 날: 날짜 페이지에 사진을 같이 싣기
      push({ t: 'day', day: k, dayNo: k === 'unknown' ? null : Meta.dayDiff(startDay, k) + 1, text: (note || '').trim(), photo: lone.id });
      continue;
    }
    if (multiDay || noteChunks.length) {
      push({ t: 'day', day: k, dayNo: k === 'unknown' ? null : Meta.dayDiff(startDay, k) + 1, text: noteChunks[0] || '' });
      noteChunks.slice(1).forEach(c => push({ t: 'text', text: c, owner: 'day', day: k }));
    }
    let small = [];
    const flushSmall = () => {
      let n = small.length, i = 0;
      while (n > 0) {
        let take = n === 5 ? 3 : n >= 4 ? 4 : n;
        const t = take === 4 ? 'grid' : take === 3 ? 'trio' : take === 2 ? 'pair' : 'inset';
        push({ t, photos: small.slice(i, i + take).map(p => p.id) }); i += take; n -= take;
      }
      small = [];
    };
    for (const p of days.get(k)) {
      const size = p.hero ? 'big' : (p.layout || 'auto');
      if (p.note) {
        flushSmall();
        const land = ar(p) > 1.15;
        const cap = land ? CAP.storyWide : CAP.story;
        const ch = chunkText(p.note, cap, CAP.text);
        push({ t: land ? 'storyWide' : 'story', photos: [p.id], text: ch[0] });
        ch.slice(1).forEach(c => push({ t: 'text', text: c, owner: 'photo', photo: p.id }));
        continue;
      }
      const spreadish = size === 'big' ? ar(p) >= 1.25 : (size === 'auto' && isSpreadAr(p));
      const pageish = size === 'big' ? ar(p) < 1.25 : (size === 'auto' && isPageAr(p));
      if (size !== 'small' && spreadish) {
        flushSmall();
        if (atLeft()) { push({ t: 'bleedL', photos: [p.id] }); push({ t: 'bleedR', photos: [p.id] }); }
        else push({ t: 'inset', photos: [p.id] }); // 오른쪽 페이지에서 시작하면 펼침면이 안 되니 한 페이지에
        continue;
      }
      if (size !== 'small' && pageish) { flushSmall(); push({ t: 'bleed', photos: [p.id] }); continue; }
      small.push(p);
    }
    flushSmall();
  }
  push({ t: 'end' });
  return { pages, shown, hiddenBy, no, cover };
}

window.Pages = { plan, groupBursts, visiblePhotos, chunkText, ar, isSpreadAr, isPageAr, CAP };
})();
