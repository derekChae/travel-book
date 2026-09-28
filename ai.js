// AI로 글쓰기
// A. 공유: 사진 + 요청문을 폰 공유 창으로 ChatGPT·Gemini 앱에 보냄 → 답을 붙여넣으면 제자리에 채움 (쓰던 구독 그대로)
// B. PC 크롬 내장 AI(Gemini Nano)가 있으면 이 기기 안에서 바로 초안
(() => {
const { S, $, esc, toast, urlFor } = App;
const MAX_IMAGES = 10;

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
    return `사진 ${no(p)}: ${bits}${attach.includes(p) ? '' : ' (첨부 안 함)'}${p.note ? `\n  내가 쓴 메모: "${p.note}"` : ''}`;
  };
  const notes = [];
  if (t.title) notes.push(`내가 정한 제목: "${t.title}" (그대로 써도 되고 더 좋게 다듬어도 돼)`);
  if (t.lede) notes.push(`내가 쓴 소개: "${t.lede}"`);
  Object.entries(t.dayNotes || {}).forEach(([k, v]) => { if (v) notes.push(`${dayLabel(k)}에 내가 쓰거나 말로 남긴 글: "${v}" (말로 남긴 거라 구어체일 수 있어. 내용은 살리고 문장만 다듬어줘)`); });

  return `첨부한 여행 사진으로 여행 매거진에 실을 글을 써줘.

규칙
- 사진에 보이는 것과 아래 정보만 근거로 써. 사진에 안 보이는 건 지어내지 마. (누구와 갔는지, 먹은 음식, 기분 같은 건 보이지 않으면 쓰지 마)
- 담백한 한국어 에세이 문체. 과장, 감탄사, 이모지, 번역투는 쓰지 마.
- 내가 쓴 메모나 글이 있으면 그 내용을 살려서 다듬어줘.
- 아래 형식 그대로, 대괄호 표시를 지켜서 답해줘. 앞뒤에 다른 말은 붙이지 마.

형식
[제목] 12자 이내
[소개] 2문장 이내
${dayKeys.map(k => `[${dayLabel(k)}] 3~5문장`).join('\n')}
[사진 번호] 1~2문장 (할 말이 있는 사진만. 예: [사진 3] ...)

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
  const out = { title: null, lede: null, days: {}, photos: {} };
  const clean = text.replace(/\*\*/g, '').replace(/\r/g, '');
  const re = /\[\s*(제목|소개|날짜\s*모름|\d+\s*일차|사진\s*\d+)\s*\]\s*[:：]?\s*/g;
  const marks = []; let m;
  while ((m = re.exec(clean))) marks.push({ key: m[1].replace(/\s+/g, ''), start: m.index, end: re.lastIndex });
  marks.forEach((mk, i) => {
    const val = clean.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim().replace(/\n{3,}/g, '\n\n');
    if (!val) return;
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
  const before = { title: t.title, lede: t.lede, dayNotes: { ...(t.dayNotes || {}) }, photos: {} };
  if (r.title) t.title = r.title;
  if (r.lede) t.lede = r.lede;
  t.dayNotes = { ...(t.dayNotes || {}), ...r.days };
  await DB.putTrip(t);
  for (const [id, v] of Object.entries(r.photos)) { const p = S.photos.find(x => x.id === id); if (!p) continue; before.photos[id] = p.note || ''; p.note = v; await DB.putPhoto(p); }
  App.rerender();
  toast('글을 채웠어요', 6000, { label: '되돌리기', run: async () => {
    t.title = before.title; t.lede = before.lede; t.dayNotes = before.dayNotes; await DB.putTrip(t);
    for (const [id, v] of Object.entries(before.photos)) { const p = S.photos.find(x => x.id === id); if (p) { p.note = v; await DB.putPhoto(p); } }
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
    <p>사진 ${d.attach.length}장과 요청문을 AI에게 보내고, 받은 답을 붙여넣으면 제목·소개·날짜별 글·사진 설명이 제자리에 채워져요.</p>
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

window.AI = { open, buildPrompt, parseAnswer, tripData, builtinStatus };
})();
