// 나의 여행책 — 누르면 일어나는 일들
(() => {
const { S, $, esc, uid, dayKey, fmtFull, fmtTime, placeText, tripInfo, orderedTrips, rerender, route, toast, urlFor } = App;
const isAndroid = /Android/i.test(navigator.userAgent);
let seq = 0;

// ---------- 아래에서 올라오는 창 ----------
let closeSheetFn = null;
function openSheet(html, { onClose } = {}) {
  closeSheet(true);
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
  sh.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('on'); sh.classList.add('on'); });
  const prev = document.activeElement;
  closeSheetFn = (instant) => {
    closeSheetFn = null; if (onClose) onClose();
    bg.classList.remove('on'); sh.classList.remove('on');
    const rm = () => { bg.remove(); sh.remove(); };
    instant ? rm() : setTimeout(rm, 220);
    if (prev && prev.focus) prev.focus({ preventScroll: true });
  };
  bg.addEventListener('click', () => closeSheet());
  return sh;
}
function closeSheet(instant) { if (closeSheetFn) closeSheetFn(instant); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && closeSheetFn) closeSheet(); });

function autosave(el, save, status) {
  let t = null;
  const run = async () => { t = null; await save(el.value); if (status) status.textContent = '저장됐어요'; };
  el.addEventListener('input', () => { if (status) status.textContent = '저장 중…'; clearTimeout(t); t = setTimeout(run, 400); });
  return () => { if (t) { clearTimeout(t); run(); } }; // 창 닫을 때 바로 저장
}

// ---------- 사진 넣기 ----------
function pickFiles() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  // 안드로이드 크롬은 '사진 고르기' 창에서 위치 정보를 지워버림. 파일 창으로 열면 위치가 남음.
  inp.accept = isAndroid ? 'image/*,video/*,text/plain' : 'image/*,video/*';
  inp.style.display = 'none'; document.body.appendChild(inp);
  inp.addEventListener('change', () => { const files = [...inp.files]; inp.remove(); if (files.length) importFiles(files); });
  inp.click();
}

async function importFiles(files) {
  files = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name) || Meta.isVideo(f));
  if (!files.length) { toast('넣을 사진이 없어요'); return; }
  const sh = openSheet(`<h3>사진 정리하는 중</h3><div class="progress"><i></i></div><div class="saved" id="prog-txt">0 / ${files.length}</div>
    <div class="tip">사진이 많으면 조금 걸려요. 화면을 켜 둔 채로 기다려 주세요. 중간에 멈춰도 정리된 사진은 저장돼 있어요.</div>`);
  const bar = $('.progress i', sh), txt = $('#prog-txt', sh);
  let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch { }
  const existing = new Set(S.photos.map(p => p.sig));
  const newPhotos = [], failed = [], skipped = [];
  // 영상은 시간대 정보가 없어서, 같이 넣은 사진들의 시간대를 빌려 씀
  const offsetGuess = () => { const c = {}; [...S.photos, ...newPhotos, ...batch].forEach(p => { if (p.offset && p.kind !== 'video') c[p.offset] = (c[p.offset] || 0) + 1; }); return Object.keys(c).sort((x, y) => c[y] - c[x])[0] || null; };
  const touched = new Set(), created = [];
  let batch = [], blobs = [];
  const flushBatch = async () => {
    if (!batch.length) return;
    const trips = [...S.trips];
    const r = Meta.assignTrips(batch, trips, S.photos, () => ({ id: uid(), title: '', lede: '', dayNotes: {}, createdAt: new Date().toISOString() }));
    r.touched.forEach(id => touched.add(id)); created.push(...r.created);
    const changedTrips = trips.filter(t => r.touched.has(t.id)).map(t => ({ ...t, updatedAt: new Date().toISOString() }));
    await DB.saveImport({ trips: changedTrips, photos: batch, blobs });
    S.trips = trips.map(t => changedTrips.find(c => c.id === t.id) || t);
    S.photos = S.photos.concat(batch); newPhotos.push(...batch);
    batch = []; blobs = [];
  };
  try {
    for (let k = 0; k < files.length; k++) {
      const f = files[k];
      txt.textContent = `${k + 1} / ${files.length}`; bar.style.width = ((k + 1) / files.length * 100) + '%';
      try {
        const vid = Meta.isVideo(f);
        const info = vid ? await Meta.readVideoInfo(f, offsetGuess()) : await Meta.readPhotoInfo(f);
        const sig = `${info.taken || ''}|${f.size}|${f.name}`;
        if (existing.has(sig)) { skipped.push(f.name); continue; }
        const im = vid ? await Meta.makeVideoImages(f) : await Meta.makeImages(f);
        const place = await Meta.placeFor(info.lat, info.lon);
        const id = uid();
        batch.push({ id, tripId: null, kind: vid ? 'video' : 'photo', duration: vid ? im.duration : undefined, tone: im.tone || null,
          taken: info.taken, offset: info.offset, timeSource: info.timeSource, lat: info.lat, lon: info.lon,
          place, camera: info.camera, w: im.w, h: im.h, note: '', fileName: f.name, size: f.size, type: f.type, sig, addedSeq: Date.now() + (seq++), addedAt: new Date().toISOString() });
        blobs.push([id + ':print', im.print], [id + ':disp', im.disp], [id + ':thumb', im.thumb]);
        if (vid) blobs.push([id + ':video', f]);
        existing.add(sig);
      } catch (e) { console.warn(e); failed.push(f.name); }
      if (batch.length >= 12) await flushBatch();
    }
    await flushBatch();
  } catch (e) {
    console.error(e); closeSheet(true); try { lock?.release(); } catch { }
    openSheet(`<h3>저장하지 못했어요</h3><p>기기 저장 공간이 부족하거나 브라우저가 저장을 막았어요. ${newPhotos.length ? `앞의 ${newPhotos.length}장은 저장됐어요.` : '아무것도 바뀌지 않았어요.'}</p><div class="sheet-actions"><button class="done" data-close>확인</button></div>`);
    rerender(); return;
  }
  try { lock?.release(); } catch { }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

  const noTime = newPhotos.filter(p => !p.taken).length;
  const noGps = newPhotos.filter(p => p.lat == null).length;
  const tripLinks = [...touched].map(id => S.trips.find(t => t.id === id)).filter(Boolean);
  closeSheet(true);
  const r = openSheet(`<h3>${newPhotos.length ? `${newPhotos.some(p => p.kind === 'video') ? '사진·영상' : '사진'} ${newPhotos.length}개를 정리했어요` : '새로 넣은 사진이 없어요'}</h3>
    <ul class="result-list">
      ${tripLinks.map(t => { const i = tripInfo(t); const isNew = created.some(c => c.id === t.id);
        return `<li><button class="chip" data-go="#/trip/${t.id}" data-close>${isNew ? '새 여행 · ' : ''}${esc(i.title)} 보기</button></li>`; }).join('')}
      ${skipped.length ? `<li>이미 들어 있는 사진 ${skipped.length}장은 건너뛰었어요</li>` : ''}
      ${failed.length ? `<li>열 수 없는 파일 ${failed.length}장: ${esc(failed.slice(0, 3).join(', '))}${failed.length > 3 ? ' 외' : ''}</li>` : ''}
    </ul>
    ${noTime ? `<div class="tip"><b>찍은 날짜가 없는 사진 ${noTime}장</b>은 '날짜 모르는 사진'에 모아뒀어요. 사진을 눌러 날짜를 넣을 수 있어요.</div>` : ''}
    ${newPhotos.length && noGps ? `<div class="tip"><b>위치 정보가 없는 사진 ${noGps}장</b>은 장소 없이 넣었어요.<br>
      ${isAndroid ? '갤럭시라면 카메라 앱 → 설정 → <b>위치 태그</b>를 켜 두면 다음부터 장소도 자동으로 들어가요. 카카오톡 등으로 주고받은 사진은 위치가 빠져 있을 수 있어요.'
        : '카메라에 위치 저장이 켜져 있는지 확인해 주세요. 메신저로 주고받은 사진은 위치가 빠져 있을 수 있어요.'}</div>` : ''}
    <div class="sheet-actions"><button class="done" data-close>확인</button></div>`);
  if (tripLinks.length === 1 && !location.hash.includes(tripLinks[0].id)) location.hash = '#/trip/' + tripLinks[0].id;
  else rerender();
}

// ---------- 사진 한 장 ----------
async function openPhoto(id) {
  const p = S.photos.find(x => x.id === id); if (!p) return;
  const t = S.trips.find(x => x.id === p.tripId);
  const plan = Pages.plan(t, App.tripPhotos(t.id));
  const similar = [...plan.hiddenBy].filter(([, rep]) => rep === p.id).map(([hid]) => S.photos.find(x => x.id === hid)).filter(Boolean);
  const when = p.taken ? `${fmtFull(p.taken.slice(0, 10))} ${fmtTime(p)}` : p.assignedDate ? `${fmtFull(p.assignedDate)} (직접 넣은 날짜)` : null;
  const where = p.place && p.place.name ? `${placeText(p)}${p.place.country ? ', ' + p.place.country : ''}${p.place.source === 'photo' ? ` (사진으로 확인${p.place.evidence ? ': ' + p.place.evidence : ''})` : ''}` : (p.lat != null ? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` : null);
  const size = (p.hero || p.layout === 'big') ? 'big' : (p.layout || 'auto');
  const sh = openSheet(`
    <div class="focus-wrap"><img class="sheet-photo" id="fp-img" alt="" src="${await urlFor(p.id + ':disp')}"><span class="focus-dot" id="fp-dot" hidden></span></div>
    ${p.kind === 'video' ? `<button class="chip" id="fp-play" style="margin-top:8px">영상 재생 · ${Story.dur(p.duration)}</button>` : ''}
    <div class="saved" id="fp-help" hidden>화면을 꽉 채우면 가장자리가 잘려요. 사진에서 꼭 보여야 할 곳을 눌러 주세요.</div>
    <dl class="facts">
      <dt>찍은 때</dt><dd>${when ? esc(when) : '<span class="unknown">사진에 날짜 정보가 없어요</span>'}</dd>
      <dt>장소</dt><dd>${where ? esc(where) : '<span class="unknown">사진에 위치 정보가 없어요</span>'}</dd>
    </dl>
    ${!p.taken ? `<label class="saved" for="adate">날짜를 알면 넣어주세요</label><input type="date" id="adate" value="${p.assignedDate || ''}" style="margin-bottom:12px">` : ''}
    <label for="note" class="sr">이 사진 이야기</label>
    <textarea id="note" placeholder="이 사진 이야기 (쓰면 사진 옆에 글이 함께 실려요)">${esc(p.note)}</textarea>
    <div class="saved" id="note-st"></div>
    <div class="seg-label">이 사진을</div>
    <div class="seg" id="sizeSeg">${[['auto', '보통'], ['big', '화면 가득'], ['small', '작게']].map(([k, l]) => `<button data-size="${k}" aria-pressed="${size === k}">${l}</button>`).join('')}</div>
    ${similar.length ? `<div class="seg-label">비슷한 사진 ${similar.length}장 (숨겨져 있어요, 누르면 책에 넣어요)</div>
      <div class="thumbs">${(await Promise.all(similar.map(async q => `<button data-show="${q.id}"><img alt="" src="${await urlFor(q.id + ':thumb')}"></button>`))).join('')}</div>` : ''}
    <div class="sheet-actions">
      <button data-act="set-cover" data-id="${p.id}">표지로</button>
      <button data-act="move-photo" data-id="${p.id}">다른 여행으로</button>
      <button class="danger" data-act="hide-photo" data-id="${p.id}">책에서 빼기</button>
      <button class="done" data-close>완료</button>
    </div>`, { onClose: () => { flush(); rerender(); } });
  const ta = $('#note', sh);
  const flush = autosave(ta, async v => { if (p._gone) return; p.note = v.trim(); await DB.putPhoto(p); }, $('#note-st', sh));
  // 화면 가득/표지일 때: 꼭 보여야 할 곳 누르기
  $('#fp-play', sh)?.addEventListener('click', () => { closeSheet(true); Motion.openPlayer(p.id); });
  const fImg = $('#fp-img', sh), fDot = $('#fp-dot', sh), fHelp = $('#fp-help', sh);
  const isBig = () => !!(p.hero || p.layout === 'big' || (t.coverId ? t.coverId === p.id : plan.cover && plan.cover.id === p.id));
  const placeDot = () => {
    const on = isBig(); fHelp.hidden = !on; fDot.hidden = !on; fImg.classList.toggle('focusable', on);
    if (!on) return;
    const f = p.focus || { x: 50, y: 50 };
    const r = fImg.getBoundingClientRect(), wr = fImg.parentElement.getBoundingClientRect();
    const iw = fImg.naturalWidth, ih = fImg.naturalHeight; const sc = Math.min(r.width / iw, r.height / ih);
    const dw = iw * sc, dh = ih * sc; const ox = r.left - wr.left + (r.width - dw) / 2, oy = r.top - wr.top + (r.height - dh) / 2;
    fDot.style.left = (ox + dw * f.x / 100) + 'px'; fDot.style.top = (oy + dh * f.y / 100) + 'px';
  };
  if (fImg.complete) placeDot(); else fImg.onload = placeDot;
  fImg.addEventListener('click', async e => {
    if (!isBig()) return;
    const r = fImg.getBoundingClientRect(); const iw = fImg.naturalWidth, ih = fImg.naturalHeight; const sc = Math.min(r.width / iw, r.height / ih);
    const dw = iw * sc, dh = ih * sc; const x = (e.clientX - r.left - (r.width - dw) / 2) / dw * 100, y = (e.clientY - r.top - (r.height - dh) / 2) / dh * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    p.focus = { x: Math.round(x), y: Math.round(y) }; await DB.putPhoto(p); placeDot(); $('#note-st', sh).textContent = '이 부분이 꼭 보이게 할게요';
  });
  if (window.Voice) Voice.attachMic(ta, $('#note-st', sh));
  const ad = $('#adate', sh);
  if (ad) ad.addEventListener('change', async () => { p.assignedDate = ad.value || null; await DB.putPhoto(p); $('#note-st', sh).textContent = '날짜를 넣었어요'; });
  $('#sizeSeg', sh).addEventListener('click', async e => {
    const b = e.target.closest('[data-size]'); if (!b) return;
    const v = b.dataset.size; p.hero = v === 'big'; if (!p.hero) delete p.hero; p.layout = v === 'small' ? 'small' : undefined; await DB.putPhoto(p);
    sh.querySelectorAll('[data-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#note-st', sh).textContent = b.dataset.size === 'big' ? '화면 가득 보여줄게요' : '바꿨어요'; placeDot();
  });
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-show]'); if (!b) return;
    const q = S.photos.find(x => x.id === b.dataset.show); q.show = true; delete q.hidden; await DB.putPhoto(q);
    b.remove(); $('#note-st', sh).textContent = '책에 넣었어요';
  });
}


// ---------- 사진 고르기: 하이라이트 / 표지 / 빼기 (누르면 바로 반영) ----------
async function openPicker(t) {
  const ps = App.tripPhotos(t.id);
  const plan = Pages.plan(t, ps);
  let mode = 'hero';
  const sh = openSheet(`<h3>사진 고르기</h3>
    <div class="seg" id="pk-mode"><button data-m="hero" aria-pressed="true">화면 가득</button><button data-m="cover" aria-pressed="false">표지</button><button data-m="hide" aria-pressed="false">빼기</button></div>
    <p class="saved" id="pk-help">크게 보여주고 싶은 순간을 누르세요. 누르면 바로 바뀌어요.</p>
    <div class="pk-grid" id="pk"></div>
    <div class="sheet-actions"><button class="done" data-close>완료</button></div>`, { onClose: () => rerender() });
  const help = { hero: '크게 보여주고 싶은 순간을 누르세요. 누르면 바로 바뀌어요.', cover: '표지로 쓸 사진을 하나 누르세요.', hide: '책에서 뺄 사진을 누르세요. 다시 누르면 돌아와요.' };
  const draw = async () => {
    const cur = Pages.plan(t, App.tripPhotos(t.id));
    const coverId = cur.cover && cur.cover.id;
    $('#pk', sh).innerHTML = (await Promise.all(ps.map(async p => {
      const tags = [];
      if (p.id === coverId) tags.push('<span class="tg tg-cover">표지</span>');
      if (p.hero || p.layout === 'big') tags.push('<span class="tg tg-hero">화면 가득</span>');
      if (p.hidden) tags.push('<span class="tg tg-hide">뺌</span>');
      else if (cur.hiddenBy.has(p.id)) tags.push('<span class="tg tg-sim">비슷해서 숨김</span>');
      return `<button class="pk-item${p.hidden ? ' off' : ''}" data-id="${p.id}"><img alt="" src="${await urlFor(p.id + ':thumb')}"><span class="tags">${tags.join('')}</span><span class="tm">${fmtTime(p)}</span></button>`;
    }))).join('');
  };
  await draw();
  $('#pk-mode', sh).addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; sh.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#pk-help', sh).textContent = help[mode]; });
  $('#pk', sh).addEventListener('click', async e => {
    const b = e.target.closest('.pk-item'); if (!b) return;
    const p = S.photos.find(x => x.id === b.dataset.id);
    if (mode === 'hero') { if (p.hero || p.layout === 'big') { delete p.hero; if (p.layout === 'big') delete p.layout; } else { p.hero = true; delete p.hidden; if (p.layout === 'small') delete p.layout; p.show = true; } await DB.putPhoto(p); }
    else if (mode === 'cover') { t.coverId = p.id; delete p.hidden; await DB.putTrip(t); await DB.putPhoto(p); }
    else if (mode === 'hide') { if (p.hidden) delete p.hidden; else { p.hidden = true; delete p.show; } await DB.putPhoto(p); }
    await draw(); rerender();
  });
}
function openShareMenu(t) {
  openSheet(`<h3>보내기 · 저장</h3><div class="pick-list">
    <button data-act="publish"><b>링크로 보여주기 (비밀번호)</b><small>비밀번호를 아는 사람만 이 화면 그대로 볼 수 있어요</small></button>
    <button data-act="export"><b>파일로 내보내기</b><small>책 PDF · AI·노션용 파일 · 블로그용 글</small></button>
    <button data-go="#/book/${t.id}" data-close><b>책 모양으로 보기</b><small>인쇄했을 때 페이지가 어떻게 나오는지</small></button>
  </div>`);
}

// ---------- 글 쓰기 창 (제목·한 줄·하루 이야기) ----------
function openTextSheet({ title, value, placeholder, multiline, save }) {
  const sh = openSheet(`<h3>${esc(title)}</h3>
    ${multiline ? `<textarea id="tx" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>` : `<input type="text" id="tx" value="${esc(value || '')}" placeholder="${esc(placeholder)}">`}
    <div class="saved" id="tx-st"></div>
    <div class="sheet-actions"><button class="done" data-close>완료</button></div>`, { onClose: () => { flush(); rerender(); } });
  const el = $('#tx', sh);
  const flush = autosave(el, v => save(v.trim()), $('#tx-st', sh));
  if (multiline && window.Voice) Voice.attachMic(el, $('#tx-st', sh));
  setTimeout(() => el.focus(), 250);
}
const curTrip = () => { const a = document.querySelector('[data-trip]'); return a && S.trips.find(t => t.id === a.dataset.trip); };

// ---------- 백업 ----------
async function exportBackup() {
  toast('백업 파일 만드는 중…');
  const entries = [{ name: 'data.json', data: JSON.stringify({ app: 'travel-book', version: 1, exportedAt: new Date().toISOString(), trips: S.trips, photos: S.photos }) }];
  for (const p of S.photos) for (const k of ['orig', 'print', 'disp', 'thumb', 'video']) {
    const b = await DB.getBlob(p.id + ':' + k); if (b) entries.push({ name: `photos/${p.id}.${k}`, data: b });
  }
  const zip = await Zip.makeZip(entries);
  const d = new Date(); const name = `여행책-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.zip`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(`${name} 저장했어요 (사진 ${S.photos.length}장)`, 4000);
}
function importBackup() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,application/zip';
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const files = await Zip.readZip(f);
      const data = JSON.parse(new TextDecoder().decode(files['data.json']));
      if (data.app !== 'travel-book') throw new Error('이 앱의 백업 파일이 아니에요');
      const haveT = new Set(S.trips.map(t => t.id)), haveP = new Set(S.photos.map(p => p.id));
      const trips = data.trips.filter(t => !haveT.has(t.id)), photos = data.photos.filter(p => !haveP.has(p.id));
      const blobs = [];
      for (const p of photos) for (const k of ['orig', 'print', 'disp', 'thumb', 'video']) {
        const u8 = files[`photos/${p.id}.${k}`]; if (u8) blobs.push([p.id + ':' + k, new Blob([u8], { type: (k === 'orig' || k === 'video') ? (p.type || 'application/octet-stream') : 'image/jpeg' })]);
      }
      await DB.saveImport({ trips, photos, blobs });
      S.trips = S.trips.concat(trips); S.photos = S.photos.concat(photos);
      toast(`여행 ${trips.length}개, 사진 ${photos.length}장을 불러왔어요`, 4000); rerender();
    } catch (e) { toast('불러오지 못했어요: ' + e.message, 4000); }
  });
  inp.click();
}

// ---------- 누르기 처리 ----------
document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]');
  const closer = e.target.closest('[data-close]');
  if (closer) closeSheet();
  if (go) { App.go(go.dataset.go, go); return; }
  if (closer) return;
  const ph = e.target.closest('[data-photo]'); if (ph) { openPhoto(ph.dataset.photo); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'add') { if (window.Folder) Folder.start(); else pickFiles(); }
  else if (act === 'pick-files-direct') { closeSheet(true); pickFiles(); }
  else if (act === 'edit-title') { const t = curTrip(); openTextSheet({ title: '여행 제목', value: t.title || tripInfo(t).title, placeholder: '예: 하쿠바 눈 여행', save: async v => { t.title = v; await DB.putTrip(t); } }); }
  else if (act === 'edit-lede') { const t = curTrip(); openTextSheet({ title: '이 여행을 한 줄로', value: t.lede, placeholder: '어떤 여행이었나요?', multiline: true, save: async v => { t.lede = v; await DB.putTrip(t); } }); }
  else if (act === 'edit-day') { const t = curTrip(); const k = a.dataset.day; t.dayNotes = t.dayNotes || {};
    openTextSheet({ title: k === 'unknown' ? '이야기' : fmtFull(k), value: t.dayNotes[k], placeholder: '이날 있었던 일', multiline: true, save: async v => { if (v) t.dayNotes[k] = v; else delete t.dayNotes[k]; await DB.putTrip(t); } }); }
  else if (act === 'set-cover') { const p = S.photos.find(x => x.id === a.dataset.id); const t = S.trips.find(x => x.id === p.tripId); t.coverId = p.id; await DB.putTrip(t); closeSheet(); toast('표지로 정했어요'); }
  else if (act === 'del-photo') {
    if (!confirm('이 사진을 여행책에서 뺄까요? 폰 갤러리의 원본은 그대로예요.')) return;
    const id = a.dataset.id; const gone = S.photos.find(x => x.id === id); if (gone) gone._gone = true; await DB.deletePhoto(id); S.photos = S.photos.filter(p => p.id !== id); closeSheet(); toast('사진을 뺐어요');
  }
  else if (act === 'move-photo') {
    const p = S.photos.find(x => x.id === a.dataset.id);
    const others = orderedTrips().filter(x => x.t.id !== p.tripId);
    const sh = openSheet(`<h3>어느 여행으로 옮길까요?</h3><div class="pick-list">
      ${others.map(x => `<button data-move-to="${x.t.id}">${esc(x.i.title)} <span class="saved">${App.fmtRange(x.i.start, x.i.end)}</span></button>`).join('')}
      <button data-move-to="__new">+ 새 여행으로</button></div>`, { onClose: () => rerender() });
    sh.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-move-to]'); if (!b) return;
      let to = b.dataset.moveTo;
      if (to === '__new') { const t = { id: uid(), title: '', lede: '', dayNotes: {}, createdAt: new Date().toISOString() }; await DB.putTrip(t); S.trips.push(t); to = t.id; }
      p.tripId = to; await DB.putPhoto(p); closeSheet(); toast('옮겼어요');
    });
  }
  else if (act === 'print-trip') { const t = curTrip(); closeSheet(true); location.hash = '#/print/' + t.id; }
  else if (act === 'export') { const t = curTrip(); closeSheet(true); if (window.Export) Export.open(t); }
  else if (act === 'publish') { const t = curTrip(); closeSheet(true); if (window.Publish) Publish.open(t); }
  else if (act === 'ai') { if (window.AI) AI.open(curTrip()); }
  else if (act === 'voice') { if (window.Voice) Voice.quickNote(curTrip()); }
  else if (act === 'pick') openPicker(curTrip());
  else if (act === 'share-menu') openShareMenu(curTrip());
  else if (act === 'hide-photo') {
    const p = S.photos.find(x => x.id === a.dataset.id); p.hidden = true; delete p.show; await DB.putPhoto(p); closeSheet();
    toast('책에서 뺐어요. 사진은 그대로 있어요.', 4000, { label: '되돌리기', run: async () => { delete p.hidden; await DB.putPhoto(p); rerender(); } });
  }
  else if (act === 'do-print') window.print();
  else if (act === 'trip-menu') {
    const t = curTrip();
    openSheet(`<h3>${esc(tripInfo(t).title)}</h3><div class="pick-list">
      <button data-act="print-trip2" data-id="${t.id}">책으로 뽑기 (PDF)</button>
      <button data-act="edit-title">제목 바꾸기</button>
      <button data-act="del-trip" data-id="${t.id}" style="color:#b3261e">이 여행 지우기</button></div>`);
  }
  else if (act === 'print-trip2') { closeSheet(true); location.hash = '#/print/' + a.dataset.id; }
  else if (act === 'del-trip') {
    const t = S.trips.find(x => x.id === a.dataset.id); const ps = S.photos.filter(p => p.tripId === t.id);
    if (!confirm(`'${tripInfo(t).title}'와 사진 ${ps.length}장을 여행책에서 지울까요? 폰 갤러리의 원본은 그대로예요.`)) return;
    for (const p of ps) await DB.deletePhoto(p.id);
    await DB.deleteTrip(t.id);
    S.photos = S.photos.filter(p => p.tripId !== t.id); S.trips = S.trips.filter(x => x.id !== t.id);
    closeSheet(true); location.hash = '#/'; toast('지웠어요');
  }
  else if (act === 'home-menu') {
    openSheet(`<h3>더보기</h3><div class="pick-list">
      <button data-act="print-all">전체를 한 권의 책으로 뽑기 (PDF)</button>
      <button data-act="backup">백업 파일 저장</button>
      <button data-act="restore">백업 파일 불러오기</button></div>
      <div class="tip">사진과 글은 이 기기(브라우저) 안에만 저장돼요. 폰을 바꾸거나 PC로 옮길 때는 <b>백업 파일 저장</b> → 다른 기기에서 <b>불러오기</b>를 해 주세요.</div>`);
  }
  else if (act === 'print-all') { closeSheet(true); location.hash = '#/print/all'; }
  else if (act === 'backup') { closeSheet(); exportBackup(); }
  else if (act === 'restore') { closeSheet(); importBackup(); }
});

// ---------- 시작 ----------
(async () => {
  try {
    const [trips, photos] = await Promise.all([DB.allTrips(), DB.allPhotos()]);
    S.trips = trips; S.photos = photos;
  } catch (e) { console.error(e); toast('저장소를 열지 못했어요. 비공개 창에서는 저장이 안 될 수 있어요.', 5000); }
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
window.Actions = { importFiles, exportBackup, pickFiles, openPhoto };
App.openSheet = openSheet; App.closeSheet = closeSheet;
})();
