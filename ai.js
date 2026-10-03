// AI로 글쓰기
// A. 공유: 사진 + 요청문을 폰 공유 창으로 ChatGPT·Gemini 앱에 보냄 → 답을 붙여넣으면 제자리에 채움 (쓰던 구독 그대로)
// B. PC 크롬 내장 AI(Gemini Nano)가 있으면 이 기기 안에서 바로 초안
(() => {
const { S, $, esc, toast, urlFor } = App;
const MAX_IMAGES = 10;
// 편집 규칙 (하네스). HARNESS.md와 같은 내용. 사람이 하든 AI가 하든 이 규칙대로 구성한다.
const RULES = `편집 규칙
1. 사실만: 사진에 보이는 것, 찍은 시각, 위치 정보, 내가 쓰거나 말로 남긴 메모만 근거로 쓴다. 같이 간 사람, 먹은 것, 기분은 지어내지 않는다.
2. 장소 찾기: 위치 정보가 없어도 장소는 편집자가 직접 찾는다. 간판·표지판 글자, 번호판 지역명, 이름난 지형과 건축물, 같은 날 앞뒤 사진의 흐름을 근거로 삼는다. 근거가 확실한 장소만 쓰고 [장소 사진 N]에 근거를 함께 적는다. 공식 자료로 좌표를 확인했으면 세 번째 칸에 위도,경도를 적는다(지도 동선에 쓰인다). 앞 장소에서 이 사진 장소까지 무엇을 타고 왔는지도 근거가 있으면 [이동 사진 N]에 적는다(사진에 탈것이 보이거나, 두 장소를 잇는 교통수단이 하나뿐이라고 공식 자료로 확인될 때). 근거가 없으면 쓰지 않는다. 확실하지 않으면 쓰지 말고 [확인 필요]에 물어본다. 위치 정보(GPS)가 있으면 그것이 우선이다.
3. 순서: 사진은 찍은 순서 그대로 둔다. 글도 시간 흐름(아침에서 저녁)을 따른다.
4. 표지: 여행 전체를 대표하는 넓은 장면 한 장. 제목을 얹을 하늘이나 여백이 있는 사진, 사람이 작게 들어가 크기가 느껴지는 사진을 우선한다. 얼굴이 크게 나온 사진은 피한다.
5. 화면 가득: 전체 사진의 약 5분의 1(최소 1장, 하루 2장 이하). 움직임이 핵심인 영상(눈발, 물살, 파도, 사람들의 움직임)은 우선 후보다. 규모가 큰 풍경, 사람과 풍경의 크기 대비, 그 여행에서만 볼 수 있는 결정적 장면을 고른다. 표지와 같은 사진, 연달아 두 장은 고르지 않는다.
6. 빼기: 거의 같은 구도의 반복, 흔들리거나 초점이 나간 사진만 뺀다. 애매하면 남긴다.
7. 제목: 12자 이내 명사형. 확인한 장소, 계절, 사진에 보이는 것으로 짓는다.
8. 문체: 담백한 한국어 평서문(~다). 감탄사, 과장, 이모지, 번역투, 느낌표를 쓰지 않는다. 시각은 '아침 7시 반'처럼 자연스럽게 쓴다.
9. 메모 우선: 내가 쓰거나 말로 남긴 글이 있으면 그 내용을 살리고 문장만 다듬는다. 말로 남긴 글은 구어체일 수 있다.`;



function tripData(t) {
  const info = App.tripInfo(t);
  const plan = Pages.plan(t, info.ps);
  const shown = plan.shown;
  const dayKeys = [...new Set(shown.map(p => App.dayKey(p) || 'unknown'))].sort((a, b) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b));
  const dated = dayKeys.filter(k => k !== 'unknown');
  const dayLabel = k => k === 'unknown' ? '날짜 모름' : `${dated.indexOf(k) + 1}일차`;
  // 사진이 많으면 고르게 10장만 첨부
  let attach = shown;
  if (shown.length > MAX_IMAGES) { attach = []; for (let i = 0; i < MAX_IMAGES; i++) attach.push(shown[Math.round(i * (shown.length - 1) / (MAX_IMAGES - 1))]); }
  return { info, plan, shown, dayKeys, dayLabel, attach };
}

function buildPrompt(t, d) {
  const { info, shown, dayKeys, dayLabel, attach } = d;
  const no = p => shown.indexOf(p) + 1;
  const dayLine = k => {
    const ps = shown.filter(p => (App.dayKey(p) || 'unknown') === k);
    const places = [...new Set(ps.map(p => p.place && p.place.name).filter(Boolean))];
    return `- ${dayLabel(k)}: ${k === 'unknown' ? '날짜 모름' : Render.dayLabel(k)}${places.length ? ' · ' + places.join(', ') : ''} · 사진 ${ps.length}장`;
  };
  const photoLine = p => {
    const k = App.dayKey(p) || 'unknown';
    const bits = [dayLabel(k), p.taken ? p.taken.slice(11, 16) : '', p.place && p.place.name ? p.place.name : '장소 모름'].filter(Boolean).join(' · ');
    return `사진 ${no(p)}${p.kind === 'video' ? ` (영상 ${Story.dur(p.duration)}, 첨부는 대표 장면)` : ''}: ${bits}${attach.includes(p) ? '' : ' (첨부 안 함)'}${p.note ? `\n  내가 쓴 메모: "${p.note}"` : ''}`;
  };
  const notes = [];
  if (t.title) notes.push(`내가 정한 제목: "${t.title}" (그대로 써도 되고 더 좋게 다듬어도 돼)`);
  if (t.lede) notes.push(`내가 쓴 소개: "${t.lede}"`);
  Object.entries(t.dayNotes || {}).forEach(([k, v]) => { if (v) notes.push(`${dayLabel(k)}에 내가 쓰거나 말로 남긴 글: "${v}" (말로 남긴 거라 구어체일 수 있어. 내용은 살리고 문장만 다듬어줘)`); });

  return `너는 이 여행책의 편집자야. 첨부한 사진과 아래 정보로 여행 매거진 한 편을 구성하고 글을 써줘. 아래 규칙을 반드시 지켜.

${RULES}

형식 (대괄호 표시를 그대로 쓰고, 앞뒤에 다른 말은 붙이지 마)
서로 다른 안 3개를 만든다. 나라·장소·이동·확인 필요는 사실이라 맨 위 [공통]에 한 번만 쓴다. 표지·화면 가득·제목·글은 안마다 방향을 확실히 다르게 한다(예: 넓은 풍경 중심 / 사람과 순간 중심 / 시간의 흐름 중심). 세 안 모두 편집 규칙은 똑같이 지킨다.
[공통]
[나라] 나라 이름 (확실할 때만)
[장소 사진 N] 장소 이름 | 근거 | 위도,경도 (확실한 사진만, 좌표는 확인했을 때만)
[이동 사진 N] 수단 | 근거 (앞 장소에서 이 사진까지, 근거 있을 때만)
[확인 필요] 장소를 알 수 없는 사진과 질문 (없으면 없음)
[1안]
[방향] 이 안의 방향 한 줄 (15자 이내)
[표지] 사진 번호 하나
[화면 가득] 사진 번호들 (쉼표로)
[빼기] 사진 번호들 또는 없음
[초점 사진 N] 위/가운데/아래 + 왼/가운데/오른 (화면 가득·표지 사진 중 주인공이 가장자리에 있을 때만)
[제목] 12자 이내
[소개] 2문장 이내
${dayKeys.map(k => `[${dayLabel(k)}] 3~4문장`).join('\n')}
[사진 N] 1~2문장 (할 말이 있는 사진만)
[2안]
(1안과 같은 형식)
[3안]
(1안과 같은 형식)

여행 정보
- 기간: ${Render.range(info.start, info.end) || '날짜 모름'}
${dayKeys.map(dayLine).join('\n')}
${notes.length ? '\n' + notes.map(n => '- ' + n).join('\n') + '\n' : ''}
사진 목록 (첨부 순서 = 번호 순서)
${shown.map(photoLine).join('\n')}`;
}

async function makeFiles(d) {
  const files = [];
  for (const p of d.attach) {
    const url = await urlFor(p.id + ':disp');
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    const n = String(d.shown.indexOf(p) + 1).padStart(2, '0');
    files.push(new File([b], `사진${n}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}

// ----- 답 읽기 -----
function parseAnswer(text, d) {
  const out = { dir: null, title: null, lede: null, days: {}, photos: {}, cover: null, hero: null, hide: null, focus: {}, places: {}, moves: {}, country: null, ask: null };
  const nums = v => [...v.split('\n')[0].matchAll(/\d+/g)].map(x => d.shown[+x[0] - 1]).filter(Boolean).map(p => p.id);
  const clean = text.replace(/\*\*/g, '').replace(/\r/g, '');
  const re = /\[\s*(방향|나라|확인\s*필요|이동\s*사진\s*\d+|장소\s*사진\s*\d+|제목|소개|표지|화면\s*가득|빼기|초점\s*사진\s*\d+|날짜\s*모름|\d+\s*일차|사진\s*\d+)\s*\]\s*[:：]?\s*/g;
  const marks = []; let m;
  while ((m = re.exec(clean))) marks.push({ key: m[1].replace(/\s+/g, ''), start: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    const val = clean.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim().replace(/\n{3,}/g, '\n\n');
    if (!val) return;
    if (mk.key === '방향') { out.dir = val.split('\n')[0].trim(); return; }
    if (mk.key === '나라') { out.country = val.split('\n')[0].trim(); return; }
    if (mk.key === '확인필요') { out.ask = /^없음/.test(val) ? null : val; return; }
    if (mk.key.startsWith('이동사진')) {
      const p = d.shown[+mk.key.replace('이동사진', '') - 1]; if (!p) return;
      const [by, ev] = val.split('\n')[0].split('|').map(x => x.trim()); if (by) out.moves[p.id] = { by, evidence: ev || '' }; return;
    }
    if (mk.key.startsWith('장소사진')) {
      const p = d.shown[+mk.key.replace('장소사진', '') - 1]; if (!p) return;
      const [name, ev, xy] = val.split('\n')[0].split('|').map(x => x.trim());
      const mm = (xy || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (name) out.places[p.id] = { name, evidence: ev || '', lat: mm ? +mm[1] : null, lon: mm ? +mm[2] : null }; return;
    }
    if (mk.key === '표지') { out.cover = nums(val)[0] || null; return; }
    if (mk.key === '화면가득') { out.hero = /없음/.test(val) ? [] : nums(val); return; }
    if (mk.key === '빼기') { out.hide = /없음/.test(val) ? [] : nums(val); return; }
    if (mk.key.startsWith('초점사진')) {
      const p = d.shown[+mk.key.replace('초점사진', '') - 1]; if (!p) return;
      const w = val.split('\n')[0];
      out.focus[p.id] = { x: /왼/.test(w) ? 25 : /오른/.test(w) ? 75 : 50, y: /위/.test(w) ? 22 : /아래/.test(w) ? 80 : 50 }; return;
    }
    if (mk.key === '제목') out.title = val.split('\n')[0].trim().replace(/^["“]|["”]$/g, '');
    else if (mk.key === '소개') out.lede = val;
    else if (mk.key.startsWith('사진')) { const n = +mk.key.slice(2); const p = d.shown[n - 1]; if (p) out.photos[p.id] = val; }
    else {
      const k = mk.key === '날짜모름' ? 'unknown' : d.dayKeys.filter(x => x !== 'unknown')[+mk.key.replace('일차', '') - 1];
      if (k) out.days[k] = val;
    }
  });
  return out;
}

function applyTrip(t, r) {
  if (r.title) t.title = r.title;
  if (r.lede) t.lede = r.lede;
  if (r.cover) t.coverId = r.cover;
  t.dayNotes = { ...(t.dayNotes || {}), ...r.days };
}
function applyPhoto(p, r) {
  if (r.photos[p.id]) p.note = r.photos[p.id];
  if (r.hero) { if (r.hero.includes(p.id)) { p.hero = true; if (p.layout) delete p.layout; } else { delete p.hero; if (p.layout === 'big') delete p.layout; } }
  if (r.hide) { if (r.hide.includes(p.id)) { p.hidden = true; delete p.hero; } else delete p.hidden; }
  if (r.focus[p.id]) p.focus = r.focus[p.id];
  if (r.moves[p.id]) p.moveBy = r.moves[p.id];
  if (r.places[p.id] && p.lat == null) p.place = { name: r.places[p.id].name, country: r.country || (p.place && p.place.country) || null, source: 'photo', evidence: r.places[p.id].evidence, lat: r.places[p.id].lat, lon: r.places[p.id].lon };
  if (p.id === r.cover) delete p.hidden;
}
async function applyAnswer(t, r) {
  const ps = S.photos.filter(p => p.tripId === t.id);
  const before = { title: t.title, lede: t.lede, dayNotes: { ...(t.dayNotes || {}) }, coverId: t.coverId, photos: {} };
  ps.forEach(p => { before.photos[p.id] = { note: p.note || '', hero: p.hero, hidden: p.hidden, focus: p.focus, layout: p.layout, show: p.show, place: p.place, moveBy: p.moveBy }; });
  applyTrip(t, r); await DB.putTrip(t);
  for (const p of ps) { applyPhoto(p, r); await DB.putPhoto(p); }
  App.rerender();
  toast('편집안대로 채웠어요', 6000, { label: '되돌리기', run: async () => {
    t.title = before.title; t.lede = before.lede; t.dayNotes = before.dayNotes; t.coverId = before.coverId; await DB.putTrip(t);
    for (const p of ps) { const o = before.photos[p.id]; p.note = o.note; ['hero', 'hidden', 'focus', 'layout', 'show', 'place', 'moveBy'].forEach(k => { if (o[k] === undefined) delete p[k]; else p[k] = o[k]; }); await DB.putPhoto(p); }
    App.rerender();
  } });
}

// ----- 답 붙여넣기 → (여러 안이면) 안 고르기 → 실제 책 그대로 미리보기 → 이 안으로 만들기 / 다르게 해줘 -----
// 아무것도 저장하지 않고 보여주기만 한다. '이 안으로 만들기'를 눌러야 처음으로 반영된다.
const versions = new Map(); // tripId -> [{raw, parsed, round}]
function splitVersions(text) {
  const re = /\[\s*(\d+)\s*안\s*\]/g; const ms = [...text.matchAll(re)];
  if (!ms.length) return [text];
  const common = text.slice(0, ms[0].index);
  return ms.map((m, i) => common + '\n' + text.slice(m.index + m[0].length, i + 1 < ms.length ? ms[i + 1].index : undefined));
}
const filled = r => Object.keys(r.days).length + Object.keys(r.photos).length + (r.title ? 1 : 0) + (r.cover ? 1 : 0) + (r.hero ? 1 : 0) + (r.lede ? 1 : 0);
function openPaste(t, d, preset = '') {
  const vs = versions.get(t.id) || [];
  const sh = App.openSheet(`<h3>${vs.length ? '새로 받은 답 붙여넣기' : 'AI 답 붙여넣기'}</h3>
    <p class="saved" style="margin-top:-6px">AI가 준 답을 통째로 붙여넣으세요. 바로 반영하지 않고, 실제 책 모양으로 먼저 보여드려요.</p>
    <textarea id="ans" placeholder="[공통]&#10;[1안]&#10;[제목] ...&#10;[2안] ...">${esc(preset)}</textarea>
    <div id="pv"></div>
    <div class="sheet-actions">${vs.length ? '<button id="back-pk">이전 안 보기</button>' : '<button data-close>닫기</button>'}<button class="done" id="fill" disabled>미리보기</button></div>`);
  const ta = $('#ans', sh), pv = $('#pv', sh), fill = $('#fill', sh);
  let got = [];
  const show = () => {
    got = splitVersions(ta.value.replace(/\*\*/g, '')).map(x => ({ raw: x, parsed: parseAnswer(x, d) })).filter(x => filled(x.parsed));
    fill.disabled = !got.length;
    fill.textContent = got.length > 1 ? `${got.length}개 안 비교하기` : '미리보기';
    pv.innerHTML = ta.value.trim() && !got.length ? '<div class="tip">형식을 못 알아봤어요. [제목], [1일차], [사진 3] 같은 표시가 들어간 답인지 확인해 주세요.</div>' : '';
  };
  ta.addEventListener('input', show); show();
  fill.addEventListener('click', () => {
    const list = versions.get(t.id) || []; const round = list.length ? Math.max(...list.map(v => v.round)) + 1 : 1;
    got.forEach(g => list.push({ ...g, round })); versions.set(t.id, list);
    App.closeSheet(true);
    if (got.length > 1 || list.length > 1) openPick(t, d); else openBook(t, d, 0);
  });
  $('#back-pk', sh)?.addEventListener('click', () => { App.closeSheet(true); vs.length > 1 ? openPick(t, d) : openBook(t, d, 0); });
}

// 저장하지 않고 이 안을 적용한 모습만 계산 (사본에 적용)
function virtual(t, r) {
  const vt = { ...t, dayNotes: { ...(t.dayNotes || {}) } }; applyTrip(vt, r);
  const vps = S.photos.map(p => { if (p.tripId !== t.id) return p; const q = { ...p }; applyPhoto(q, r); return q; });
  return { vt, vps };
}
function withVirtual(t, r, fn) { const { vt, vps } = virtual(t, r); const real = S.photos; S.photos = vps; try { return fn(vt); } finally { S.photos = real; } }

let pvOn = null; // 미리보기 중 다른 화면으로 가면 원래대로
function leavePreview() { if (!pvOn) return; pvOn = null; document.body.classList.remove('is-pick', 'is-preview'); window.removeEventListener('hashchange', leavePreview); }
function startPreview(t) { if (!pvOn) window.addEventListener('hashchange', leavePreview); pvOn = t.id; }
function closeAll(t) { leavePreview(); window.scrollTo(0, 0); App.rerender(); }

// 안 고르기: 표지 카드로 나란히
async function openPick(t, d) {
  const list = versions.get(t.id) || []; if (!list.length) return;
  startPreview(t);
  const last = Math.max(...list.map(v => v.round));
  const font = (t.style || {}).font || 'maru'; App.ensureFont(font);
  const card = async (v, i, small) => {
    const r = v.parsed;
    const { cover, info, heroes } = withVirtual(t, r, vt => { const { info, plan } = App.storyCtx(vt); return { cover: plan.cover, info, heroes: plan.shown.filter(Story.isHero) }; });
    const u = cover ? await urlFor(cover.id + ':disp') : '';
    const hu = await Promise.all(heroes.slice(0, 3).map(p => urlFor(p.id + ':thumb')));
    return `<button class="pk-card${small ? ' small' : ''}" data-v="${i}">
      <span class="pk-cover fv" data-font="${font}">${u ? `<img src="${u}" alt="" style="${cover.focus ? `object-position:${cover.focus.x}% ${cover.focus.y}%` : ''}">` : ''}
        <span class="pk-no">${i + 1}안</span>
        <span class="pk-ct"><span class="pk-k">${esc([info.countries.join(' · '), info.places.slice(0, 2).join(' · ')].filter(Boolean).join(' · '))}</span><span class="pk-t">${esc(info.title)}</span></span></span>
      ${small ? '' : `<span class="pk-body">${r.dir ? `<span class="pk-dir">${esc(r.dir)}</span>` : ''}${r.lede ? `<span class="pk-lede">${esc(r.lede)}</span>` : ''}
        ${hu.length ? `<span class="pk-hl"><span class="pk-hll">화면 가득</span>${hu.map(x => `<img src="${x}" alt="">`).join('')}</span>` : ''}
        <span class="pk-go">책처럼 넘겨보기</span></span>`}
    </button>`;
  };
  const cur = list.map((v, i) => [v, i]).filter(([v]) => v.round === last);
  const old = list.map((v, i) => [v, i]).filter(([v]) => v.round !== last).reverse();
  document.body.className = 'is-pick';
  const view = document.getElementById('view');
  view.innerHTML = `<header class="top pk-top" id="top"><button class="back" id="pk-x">‹ 닫기</button><div class="top-title">어떤 안으로 할까요?</div><span class="pk-sp"></span></header>
    <p class="pk-sub">${cur.length > 1 ? `서로 다른 안 ${cur.length}개예요.` : ''} 눌러서 실제 책처럼 넘겨보고 고르세요. 고르기 전에는 아무것도 바뀌지 않아요.</p>
    <div class="pk-row">${(await Promise.all(cur.map(([v, i]) => card(v, i)))).join('')}</div>
    <div class="pk-foot"><button class="pk-no-btn" id="pk-none">${cur.length > 1 ? '다 별로예요, 다르게 해줘' : '다르게 해줘'}</button></div>
    ${old.length ? `<div class="pk-old"><div class="pk-oldh">이전에 받은 안</div><div class="pk-row pk-row-s">${(await Promise.all(old.map(([v, i]) => card(v, i, true)))).join('')}</div></div>` : ''}`;
  window.scrollTo(0, 0);
  view.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => openBook(t, d, +b.dataset.v)));
  $('#pk-x').addEventListener('click', () => closeAll(t));
  $('#pk-none').addEventListener('click', () => openRevise(t, d, null));
}

// 실제 책 그대로 미리보기 (이야기 화면과 똑같이 그림, 편집 버튼만 없음)
function openBook(t, d, idx) {
  const list = versions.get(t.id) || []; const v = list[idx]; if (!v) return;
  startPreview(t);
  const last = Math.max(...list.map(x => x.round));
  const same = list.map((x, i) => [x, i]).filter(([x]) => x.round === v.round);
  const font = (t.style || {}).font; App.ensureFont(font);
  const { html, vt } = withVirtual(t, v.parsed, vt => { const { sctx } = App.storyCtx(vt, { edit: false }); return { html: Story.storyHTML(sctx), vt }; });
  document.body.className = 'is-story is-preview';
  const view = document.getElementById('view');
  view.innerHTML = `<header class="top on-cover" id="top"><button class="back" id="pv-x">‹ ${list.length > 1 ? '안 고르기' : '닫기'}</button>
      <div class="top-title">${idx + 1}안 미리보기</div><span class="pv-tag">아직 반영 안 됨</span></header>
    <div class="pv-book">${html}</div><div class="pv-space"></div>
    <nav class="pvbar" aria-label="미리보기">
      ${same.length > 1 ? `<div class="pvbar-vs">${same.map(([x, i]) => `<button data-v="${i}" aria-pressed="${i === idx}">${i + 1}안</button>`).join('')}</div>` : ''}
      <div class="pvbar-act"><button id="pv-no">다르게 해줘</button><button class="pv-ok" id="pv-ok">이 안으로 만들기</button></div>
    </nav>`;
  window.scrollTo(0, 0);
  if (window.Motion) Motion.mount(view.querySelector('.st'), { trip: vt });
  App.hydrateView(view);
  view.querySelectorAll('.pvbar-vs [data-v]').forEach(b => b.addEventListener('click', () => openBook(t, d, +b.dataset.v)));
  $('#pv-x').addEventListener('click', () => list.length > 1 ? openPick(t, d) : closeAll(t));
  $('#pv-no').addEventListener('click', () => openRevise(t, d, idx));
  $('#pv-ok').addEventListener('click', async () => { leavePreview(); await applyAnswer(t, v.parsed); versions.delete(t.id); window.scrollTo(0, 0); });
}

// 다르게 해줘: 무엇이 싫은지 고르면 AI에게 보낼 '다시 부탁' 문장을 만들어 줌 (새 안 3개)
const REVISE = [['cover', '표지를 다른 사진으로'], ['hero', '화면 가득 사진을 다르게'], ['title', '제목을 다른 느낌으로'], ['text', '글을 다시'], ['short', '글을 더 짧게'], ['long', '글을 조금 더 길게'], ['all', '전체를 완전히 다르게']];
function openRevise(t, d, idx) {
  const list = versions.get(t.id) || []; const base = idx == null ? null : list[idx];
  const sh = App.openSheet(`<h3>${base ? `${idx + 1}안에서 무엇을 바꿀까요?` : '어떻게 다르게 할까요?'}</h3>
    <div class="rv-chips">${REVISE.map(([k, l]) => `<button data-rv="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
    <textarea id="rv-tx" placeholder="더 하고 싶은 말 (안 써도 돼요). 예: 사람 나온 사진을 표지로" style="margin-top:12px;min-height:80px"></textarea>
    <div class="saved" id="rv-st"></div>
    <div class="sheet-actions"><button data-close>취소</button><button class="done" id="rv-go">AI에게 새 안 부탁하기</button></div>`);
  if (window.Voice && Voice.attachMic) Voice.attachMic($('#rv-tx', sh), $('#rv-st', sh));
  sh.querySelector('.rv-chips').addEventListener('click', e => { const b = e.target.closest('[data-rv]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
  $('#rv-go', sh).addEventListener('click', async () => {
    const picked = [...sh.querySelectorAll('[data-rv][aria-pressed="true"]')].map(b => REVISE.find(x => x[0] === b.dataset.rv)[1]);
    const extra = $('#rv-tx', sh).value.trim();
    if (!picked.length && !extra) { $('#rv-st', sh).textContent = '바꾸고 싶은 것을 하나 이상 골라 주세요'; return; }
    const last = Math.max(...list.map(v => v.round));
    const brief = list.filter(v => v.round === last).map((v, i) => `- ${list.indexOf(v) + 1}안: 표지 사진 ${d.shown.findIndex(p => p.id === v.parsed.cover) + 1}, 화면 가득 ${(v.parsed.hero || []).map(id => d.shown.findIndex(p => p.id === id) + 1).join(', ') || '없음'}, 제목 "${v.parsed.title || ''}"`).join('\n');
    const ask = `${base ? `${idx + 1}안을 바탕으로` : '앞에서 준 안이 모두 마음에 안 들어.'} 아래를 바꿔서 서로 다른 새 안 3개를 같은 형식([공통] [1안] [2안] [3안])으로 다시 답해줘. 처음에 준 편집 규칙은 그대로 지켜줘.
바꿀 것: ${picked.join(', ') || '아래 메모 참고'}${extra ? `\n내 메모: ${extra}` : ''}
${picked.includes('전체를 완전히 다르게') || !base ? '앞의 안과 표지, 화면 가득, 제목이 겹치지 않게 해줘.' : '말하지 않은 부분은 바탕이 되는 안을 그대로 유지하고, 바꿀 것만 세 가지로 다르게 해줘.'}
${base ? `바탕이 되는 안:\n${base.raw.trim()}` : `앞의 안:\n${brief}`}`;
    let copied = false; try { await navigator.clipboard.writeText(ask); copied = true; } catch { }
    let shared = false;
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { try { await navigator.share({ text: ask }); shared = true; } catch { } }
    App.closeSheet(true);
    toast(shared ? '보냈어요. 새 답을 받으면 붙여넣어 주세요.' : copied ? '부탁 문장을 복사했어요. AI 대화에 붙여넣고, 새 답을 받으면 여기에 붙여넣어 주세요.' : '복사하지 못했어요', 6000);
    openPaste(t, d);
  });
}

// ----- PC 크롬 내장 AI -----
const LM_OPTS = { expectedInputs: [{ type: 'text', languages: ['ko'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['ko'] }] };
async function builtinStatus() {
  try { if (!('LanguageModel' in window)) return 'none'; return await LanguageModel.availability(LM_OPTS); } catch { return 'none'; }
}
async function runBuiltin(t, d, sh) {
  const st = $('#bi-st', sh);
  try {
    st.textContent = 'AI 준비 중… (처음이면 모델을 내려받느라 몇 분 걸릴 수 있어요)';
    const session = await LanguageModel.create({ ...LM_OPTS, monitor(m) { m.addEventListener('downloadprogress', e => { st.textContent = `AI 내려받는 중 ${Math.round(e.loaded * 100)}%`; }); } });
    const files = await makeFiles(d);
    st.textContent = '사진을 보고 글을 쓰는 중…';
    const content = [{ type: 'text', value: buildPrompt(t, d) }, ...files.map(f => ({ type: 'image', value: f }))];
    const answer = await session.prompt([{ role: 'user', content }]);
    session.destroy();
    App.closeSheet(true); openPaste(t, d, answer);
  } catch (e) { console.error(e); st.textContent = '이 PC의 내장 AI로는 쓰지 못했어요: ' + (e.message || e.name); }
}

async function open(t) {
  const d = tripData(t);
  if (!d.shown.length) { toast('먼저 사진을 넣어 주세요'); return; }
  const bi = await builtinStatus();
  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/jpeg' })], 'a.jpg', { type: 'image/jpeg' })] }));
  const sh = App.openSheet(`<h3>AI로 글쓰기</h3>
    <p>사진 ${d.attach.length}장과 편집 규칙을 AI에게 보내요. AI가 서로 다른 안 3개를 만들어요. 붙여넣으면 나란히 비교하고 실제 책 모양으로 넘겨볼 수 있어요. 마음에 드는 안이 없으면 다르게 해 달라고 다시 부탁해요.</p>
    ${d.shown.length > d.attach.length ? `<p class="saved">사진이 많아서 고르게 ${d.attach.length}장만 보내요. 나머지는 시각·장소 정보만 보내요.</p>` : ''}
    <div class="pick-list">
      ${canShareFiles ? `<button id="go-share"><b>1. ChatGPT · Gemini 앱으로 보내기</b><small>공유 창에서 앱을 고르면 사진과 요청문이 같이 들어가요</small></button>` : ''}
      <button id="go-copy"><b>${canShareFiles ? '또는 ' : '1. '}요청문 복사${canShareFiles ? '' : ' + 사진 저장'}</b><small>${canShareFiles ? '앱에 글이 안 들어가면 이걸 복사해서 붙여넣어요' : 'AI 사이트에 요청문을 붙여넣고 저장한 사진을 첨부해요'}</small></button>
      <button id="go-paste"><b>2. AI 답 붙여넣기</b><small>세 안을 비교하고 책 모양으로 먼저 봐요</small></button>
      ${bi !== 'none' && bi !== 'unavailable' ? `<button id="go-bi"><b>이 PC에서 바로 쓰기 (크롬 내장 AI)</b><small>무료, 이 기기 안에서만 처리. 품질은 큰 AI보다 낮을 수 있어요</small></button><div class="saved" id="bi-st"></div>` : ''}
    </div>
    <div class="saved" id="ai-st"></div>`);
  const st = $('#ai-st', sh);
  const prompt = buildPrompt(t, d);
  let files = null;
  const ready = (async () => { files = await makeFiles(d); })();
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); return true; } catch { return false; } };
  $('#go-share', sh)?.addEventListener('click', async () => {
    const copied = await copy();
    if (!files) { st.textContent = '사진 준비 중… 잠시 뒤 다시 눌러 주세요'; await ready; st.textContent = '준비됐어요. 한 번 더 눌러 주세요'; return; }
    try { await navigator.share({ files, text: prompt, title: App.tripInfo(t).title }); st.textContent = copied ? '보냈어요. 요청문도 복사해 뒀어요. 답을 받으면 2번을 눌러요.' : '보냈어요. 답을 받으면 2번을 눌러요.'; }
    catch (e) { if (e.name !== 'AbortError') st.textContent = '공유 창을 열지 못했어요. 요청문 복사를 써 주세요.'; }
  });
  $('#go-copy', sh).addEventListener('click', async () => {
    const ok = await copy();
    if (!canShareFiles) { await ready; const zip = await Zip.makeZip(files.map(f => ({ name: f.name, data: f }))); const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = 'AI에게-보낼-사진.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    st.textContent = ok ? `요청문을 복사했어요${canShareFiles ? '' : '. 사진도 저장했어요'}. AI에 붙여넣고 사진을 첨부해 보내세요.` : '복사하지 못했어요.';
  });
  $('#go-paste', sh).addEventListener('click', () => { App.closeSheet(true); openPaste(t, d); });
  $('#go-bi', sh)?.addEventListener('click', () => runBuiltin(t, d, sh));
}

window.AI = { open, buildPrompt, parseAnswer, applyAnswer, tripData, builtinStatus, RULES, openPaste, openPick, openBook, versions, splitVersions };
})();
