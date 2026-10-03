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
[표지] 사진 번호 하나
[화면 가득] 사진 번호들 (쉼표로)
[빼기] 사진 번호들 또는 없음
[초점 사진 N] 위/가운데/아래 + 왼/가운데/오른 (화면 가득·표지 사진 중 주인공이 가장자리에 있을 때만)
[나라] 나라 이름 (확실할 때만)
[장소 사진 N] 장소 이름 | 근거 | 위도,경도 (확실한 사진만, 좌표는 확인했을 때만)
[이동 사진 N] 수단 | 근거 (앞 장소에서 이 사진까지, 근거 있을 때만)
[확인 필요] 장소를 알 수 없는 사진과 질문 (없으면 없음)
[제목] 12자 이내
[소개] 2문장 이내
${dayKeys.map(k => `[${dayLabel(k)}] 3~4문장`).join('\n')}
[사진 N] 1~2문장 (할 말이 있는 사진만)

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
  const out = { title: null, lede: null, days: {}, photos: {}, cover: null, hero: null, hide: null, focus: {}, places: {}, moves: {}, country: null, ask: null };
  const nums = v => [...v.split('\n')[0].matchAll(/\d+/g)].map(x => d.shown[+x[0] - 1]).filter(Boolean).map(p => p.id);
  const clean = text.replace(/\*\*/g, '').replace(/\r/g, '');
  const re = /\[\s*(나라|확인\s*필요|이동\s*사진\s*\d+|장소\s*사진\s*\d+|제목|소개|표지|화면\s*가득|빼기|초점\s*사진\s*\d+|날짜\s*모름|\d+\s*일차|사진\s*\d+)\s*\]\s*[:：]?\s*/g;
  const marks = []; let m;
  while ((m = re.exec(clean))) marks.push({ key: m[1].replace(/\s+/g, ''), start: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    const val = clean.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim().replace(/\n{3,}/g, '\n\n');
    if (!val) return;
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

async function applyAnswer(t, r) {
  const ps = S.photos.filter(p => p.tripId === t.id);
  const before = { title: t.title, lede: t.lede, dayNotes: { ...(t.dayNotes || {}) }, coverId: t.coverId, photos: {} };
  ps.forEach(p => { before.photos[p.id] = { note: p.note || '', hero: p.hero, hidden: p.hidden, focus: p.focus, layout: p.layout, show: p.show, place: p.place, moveBy: p.moveBy }; });
  if (r.title) t.title = r.title;
  if (r.lede) t.lede = r.lede;
  if (r.cover) t.coverId = r.cover;
  t.dayNotes = { ...(t.dayNotes || {}), ...r.days };
  await DB.putTrip(t);
  for (const p of ps) {
    if (r.photos[p.id]) p.note = r.photos[p.id];
    if (r.hero) { if (r.hero.includes(p.id)) { p.hero = true; if (p.layout) delete p.layout; } else { delete p.hero; if (p.layout === 'big') delete p.layout; } }
    if (r.hide) { if (r.hide.includes(p.id)) { p.hidden = true; delete p.hero; } else delete p.hidden; }
    if (r.focus[p.id]) p.focus = r.focus[p.id];
    if (r.moves[p.id]) p.moveBy = r.moves[p.id];
    if (r.places[p.id] && p.lat == null) p.place = { name: r.places[p.id].name, country: r.country || (p.place && p.place.country) || null, source: 'photo', evidence: r.places[p.id].evidence, lat: r.places[p.id].lat, lon: r.places[p.id].lon };
    if (p.id === r.cover) delete p.hidden;
    await DB.putPhoto(p);
  }
  App.rerender();
  toast('편집안대로 채웠어요', 6000, { label: '되돌리기', run: async () => {
    t.title = before.title; t.lede = before.lede; t.dayNotes = before.dayNotes; t.coverId = before.coverId; await DB.putTrip(t);
    for (const p of ps) { const o = before.photos[p.id]; p.note = o.note; ['hero', 'hidden', 'focus', 'layout', 'show', 'place', 'moveBy'].forEach(k => { if (o[k] === undefined) delete p[k]; else p[k] = o[k]; }); await DB.putPhoto(p); }
    App.rerender();
  } });
}

function openPaste(t, d, preset = '') {
  const sh = App.openSheet(`<h3>AI 답 붙여넣기</h3>
    <p class="saved" style="margin-top:-6px">AI가 준 답을 통째로 복사해서 붙여넣으세요.</p>
    <textarea id="ans" placeholder="[제목] ...&#10;[소개] ...&#10;[1일차] ...">${esc(preset)}</textarea>
    <div id="pv"></div>
    <div class="sheet-actions"><button data-close>닫기</button><button class="done" id="fill" disabled>글 채우기</button></div>`);
  const ta = $('#ans', sh), pv = $('#pv', sh), fill = $('#fill', sh);
  let parsed = null;
  const show = () => {
    parsed = parseAnswer(ta.value, d);
    const rows = [];
    const nm = id => '사진 ' + (d.shown.findIndex(p => p.id === id) + 1);
    if (parsed.cover) rows.push(['표지', nm(parsed.cover)]);
    if (parsed.hero) rows.push(['화면 가득', parsed.hero.length ? parsed.hero.map(nm).join(', ') : '없음']);
    if (parsed.hide && parsed.hide.length) rows.push(['빼기', parsed.hide.map(nm).join(', ')]);
    Object.entries(parsed.places).forEach(([id, v]) => rows.push([`장소 ${nm(id).replace('사진 ', '')}`, v.name + (v.evidence ? ` (${v.evidence})` : '')]));
    Object.entries(parsed.moves).forEach(([id, v]) => rows.push([`이동 → ${nm(id).replace('사진 ', '')}`, v.by]));
    if (parsed.ask) rows.push(['확인 필요', parsed.ask]);
    if (parsed.title) rows.push(['제목', parsed.title]);
    if (parsed.lede) rows.push(['소개', parsed.lede]);
    Object.entries(parsed.days).forEach(([k, v]) => rows.push([d.dayLabel(k), v]));
    Object.entries(parsed.photos).forEach(([id, v]) => rows.push([`사진 ${d.shown.findIndex(p => p.id === id) + 1}`, v]));
    fill.disabled = !rows.length;
    pv.innerHTML = ta.value.trim() ? (rows.length ? `<div class="seg-label">채워질 글 ${rows.length}곳</div><div class="preview-list">${rows.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v.length > 80 ? v.slice(0, 80) + '…' : v)}</div>`).join('')}</div>`
      : '<div class="tip">형식을 못 알아봤어요. [제목], [1일차], [사진 3] 같은 표시가 들어간 답인지 확인해 주세요.</div>') : '';
  };
  ta.addEventListener('input', show); show();
  fill.addEventListener('click', async () => { App.closeSheet(true); await applyAnswer(t, parsed); });
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
    <p>사진 ${d.attach.length}장과 편집 규칙을 AI에게 보내요. 받은 답을 붙여넣으면 표지·화면 가득·빼기 같은 구성과 제목·글이 한 번에 채워져요.</p>
    ${d.shown.length > d.attach.length ? `<p class="saved">사진이 많아서 고르게 ${d.attach.length}장만 보내요. 나머지는 시각·장소 정보만 보내요.</p>` : ''}
    <div class="pick-list">
      ${canShareFiles ? `<button id="go-share"><b>1. ChatGPT · Gemini 앱으로 보내기</b><small>공유 창에서 앱을 고르면 사진과 요청문이 같이 들어가요</small></button>` : ''}
      <button id="go-copy"><b>${canShareFiles ? '또는 ' : '1. '}요청문 복사${canShareFiles ? '' : ' + 사진 저장'}</b><small>${canShareFiles ? '앱에 글이 안 들어가면 이걸 복사해서 붙여넣어요' : 'AI 사이트에 요청문을 붙여넣고 저장한 사진을 첨부해요'}</small></button>
      <button id="go-paste"><b>2. AI 답 붙여넣기</b><small>받은 답을 통째로 붙여넣으면 끝</small></button>
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

window.AI = { open, buildPrompt, parseAnswer, applyAnswer, tripData, builtinStatus, RULES };
})();
