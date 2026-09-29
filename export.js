// 내보내기: 책 PDF / AI·노션용 파일(마크다운+사진) / 블로그용 글
(() => {
const { S, $, esc, toast } = App;

function sections(t) {
  const d = AI.tripData(t);
  const days = d.dayKeys.map(k => ({
    k, label: d.dayLabel(k), date: k === 'unknown' ? '날짜 모름' : Render.dayLabel(k),
    places: [...new Set(d.shown.filter(p => (App.dayKey(p) || 'unknown') === k).map(p => p.place && p.place.name).filter(Boolean))],
    note: (t.dayNotes || {})[k] || '',
    photos: d.shown.filter(p => (App.dayKey(p) || 'unknown') === k),
  }));
  return { d, days, no: p => d.shown.indexOf(p) + 1 };
}
const nn = n => String(n).padStart(2, '0');

function markdown(t) {
  const { d, days, no } = sections(t); const i = d.info;
  let md = `---\ntitle: "${App.tripInfo(t).title.replace(/"/g, '\\"')}"\ndates: "${i.start || ''}${i.end && i.end !== i.start ? ' ~ ' + i.end : ''}"\nplaces: [${i.places.map(p => `"${p}"`).join(', ')}]\nphotos: ${d.shown.length}\nsource: 나의 여행책\n---\n\n`;
  md += `# ${App.tripInfo(t).title}\n\n${Render.range(i.start, i.end)}\n\n`;
  if (t.lede) md += `${t.lede}\n\n`;
  for (const day of days) {
    md += `## ${day.label} · ${day.date}${day.places.length ? ' · ' + day.places.join(', ') : ''}\n\n`;
    if (day.note) md += `${day.note}\n\n`;
    for (const p of day.photos) {
      const cap = Render.capText(p);
      md += p.kind === 'video' ? `[영상 ${no(p)} · ${Story.dur(p.duration)}](videos/${nn(no(p))}${(p.fileName.match(/\.\w+$/) || ['.mp4'])[0]})\n![영상 ${no(p)} 대표 장면](photos/${nn(no(p))}.jpg)\n*영상 ${no(p)} · ${cap}*\n\n` : `![사진 ${no(p)}](photos/${nn(no(p))}.jpg)\n*사진 ${no(p)} · ${cap}*\n\n`;
      if (p.note) md += `${p.note}\n\n`;
    }
  }
  return md;
}

function plainText(t) {
  const { d, days, no } = sections(t); const i = d.info;
  let s = `${App.tripInfo(t).title}\n${Render.range(i.start, i.end)}\n\n`;
  if (t.lede) s += `${t.lede}\n\n`;
  for (const day of days) {
    s += `■ ${day.label} · ${day.date}${day.places.length ? ' · ' + day.places.join(', ') : ''}\n\n`;
    if (day.note) s += `${day.note}\n\n`;
    for (const p of day.photos) { s += `[사진 ${no(p)}] ${Render.capText(p)}\n`; if (p.note) s += `${p.note}\n`; s += '\n'; }
  }
  return s.trim() + '\n';
}

async function zipFor(t) {
  const { d, no } = sections(t);
  const entries = [{ name: '여행글.md', data: markdown(t) }, { name: '블로그용.txt', data: plainText(t) }];
  for (const p of d.shown) { const b = await DB.getBlob(p.id + ':disp'); if (b) entries.push({ name: `photos/${nn(no(p))}.jpg`, data: b }); if (p.kind === 'video') { const v = await DB.getBlob(p.id + ':video'); if (v) entries.push({ name: `videos/${nn(no(p))}${(p.fileName.match(/\.\w+$/) || ['.mp4'])[0]}`, data: v }); } }
  return Zip.makeZip(entries);
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
const safeName = s => s.replace(/[\\/:*?"<>|]/g, '').trim() || '여행';

function open(t) {
  const title = App.tripInfo(t).title;
  const sh = App.openSheet(`<h3>내보내기</h3><div class="pick-list">
    <button data-act="print-trip"><b>책 PDF로 저장</b><small>화면과 똑같은 페이지(150×200mm)로. 인쇄소에 맡기거나 보관용</small></button>
    <button id="ex-zip"><b>AI · 노션용 파일 (마크다운 + 사진)</b><small>글과 사진, 날짜·장소가 정리된 묶음. ChatGPT·Claude·노션·옵시디언에 그대로 넣을 수 있어요</small></button>
    <button id="ex-blog"><b>블로그용 글 복사</b><small>네이버 블로그 등에 붙여넣기. 사진 자리는 [사진 번호]로 표시돼요</small></button>
    <button data-act="del-trip" data-id="${t.id}" style="color:#b3261e"><b>이 여행 지우기</b><small>폰 갤러리의 원본은 그대로예요</small></button>
  </div><div class="saved" id="ex-st"></div>`);
  const st = $('#ex-st', sh);
  $('#ex-zip', sh).addEventListener('click', async () => { st.textContent = '만드는 중…'; download(await zipFor(t), `${safeName(title)}.zip`); st.textContent = '저장했어요. 여행글.md, 블로그용.txt, photos 폴더가 들어 있어요.'; });
  $('#ex-blog', sh).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(plainText(t)); st.textContent = '복사했어요. 블로그 글쓰기에 붙여넣으세요.'; } catch { st.textContent = '복사하지 못했어요.'; }
  });
}

window.Export = { open, markdown, plainText, zipFor };
})();
