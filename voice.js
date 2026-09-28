// 말로 쓰기: 글 칸마다 마이크 버튼 + '말로 남기기' (그날 이야기에 바로 들어감)
// 폰 크롬의 음성 인식(Web Speech API)을 씀. 인식은 구글 음성 서버에서 처리돼요. 추가 비용 없음.
(() => {
const { S, $, esc, toast } = App;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!SR;
let active = null; // 지금 듣고 있는 것

function listen({ onText, onInterim, onState }) {
  if (!supported) return null;
  if (active) active.stop();
  const r = new SR();
  r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  let stopped = false;
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) onText(res[0].transcript.trim()); else interim += res[0].transcript;
    }
    onInterim && onInterim(interim);
  };
  r.onerror = e => { onState && onState('error', e.error); };
  r.onend = () => { if (active === ctl) active = null; onState && onState('end'); };
  const ctl = { stop() { if (!stopped) { stopped = true; try { r.stop(); } catch { } } } };
  try { r.start(); } catch (e) { onState && onState('error', e.message); return null; }
  active = ctl; onState && onState('start');
  return ctl;
}
const errText = code => ({ 'not-allowed': '마이크 권한이 꺼져 있어요. 주소창 옆 자물쇠 → 마이크 허용을 눌러 주세요.', 'no-speech': '말소리가 안 들렸어요. 다시 눌러 주세요.', 'network': '인터넷 연결이 필요해요.', 'audio-capture': '마이크를 찾지 못했어요.' }[code] || '음성 인식이 멈췄어요. 다시 눌러 주세요.');

// 글 칸 옆에 마이크 버튼 달기
function attachMic(ta, statusEl) {
  if (!supported || !ta || ta.dataset.mic) return;
  ta.dataset.mic = '1';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'mic-btn'; btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lb">말로 쓰기</span>';
  ta.insertAdjacentElement('afterend', btn);
  let ctl = null;
  const setOn = on => { btn.setAttribute('aria-pressed', on); btn.querySelector('.lb').textContent = on ? '듣는 중… 누르면 멈춰요' : '말로 쓰기'; };
  btn.addEventListener('click', () => {
    if (ctl) { ctl.stop(); ctl = null; setOn(false); return; }
    ctl = listen({
      onText: t => { if (!t) return; ta.value = ta.value ? ta.value.replace(/\s*$/, '') + ' ' + t : t; ta.dispatchEvent(new Event('input', { bubbles: true })); },
      onInterim: t => { if (statusEl) statusEl.textContent = t ? '… ' + t : '듣는 중…'; },
      onState: (s, code) => { if (s === 'end') { ctl = null; setOn(false); } if (s === 'error' && code !== 'aborted' && statusEl) statusEl.textContent = errText(code); },
    });
    if (ctl) setOn(true);
  });
  return btn;
}

// ----- 말로 남기기: 그날 이야기에 바로 추가 -----
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function quickNote(t) {
  if (!supported) { toast('이 브라우저는 음성 인식을 지원하지 않아요. 키보드의 마이크 버튼을 써 주세요.', 5000); return; }
  const info = App.tripInfo(t);
  const days = info.days.length ? info.days : [todayKey()];
  const today = todayKey();
  const def = days.includes(today) ? today : days[days.length - 1];
  const sh = App.openSheet(`<h3>말로 남기기</h3>
    <p class="saved" style="margin-top:-6px">생각나는 대로 편하게 말하세요. 고른 날의 이야기에 이어서 들어가요. 나중에 AI로 글쓰기를 하면 말투를 다듬어줘요.</p>
    <label class="seg-label" for="vq-day">어느 날 이야기인가요?</label>
    <select id="vq-day" class="sel">${days.map(d => `<option value="${d}" ${d === def ? 'selected' : ''}>${Render.dayLabel(d)}${d === today ? ' (오늘)' : ''}</option>`).join('')}</select>
    <button type="button" class="big-mic" id="vq-mic" aria-pressed="false"><span class="ring" aria-hidden="true"></span><span class="lb">눌러서 말하기</span></button>
    <textarea id="vq-text" placeholder="말한 내용이 여기에 적혀요. 직접 고쳐도 돼요."></textarea>
    <div class="saved" id="vq-st"></div>
    <div class="sheet-actions"><button data-close>취소</button><button class="done" id="vq-save" disabled>이야기에 넣기</button></div>`, { onClose: () => { if (ctl) ctl.stop(); } });
  const ta = $('#vq-text', sh), st = $('#vq-st', sh), mic = $('#vq-mic', sh), save = $('#vq-save', sh);
  let ctl = null;
  const setOn = on => { mic.setAttribute('aria-pressed', on); mic.querySelector('.lb').textContent = on ? '듣는 중… 누르면 멈춰요' : (ta.value ? '이어서 말하기' : '눌러서 말하기'); };
  const upd = () => { save.disabled = !ta.value.trim(); };
  ta.addEventListener('input', upd);
  mic.addEventListener('click', () => {
    if (ctl) { ctl.stop(); ctl = null; setOn(false); return; }
    ctl = listen({
      onText: x => { if (!x) return; ta.value = ta.value ? ta.value.replace(/\s*$/, '') + ' ' + x : x; upd(); },
      onInterim: x => { st.textContent = x ? '… ' + x : '듣는 중…'; },
      onState: (s, code) => { if (s === 'end') { ctl = null; setOn(false); if (!st.textContent.startsWith('마이크')) st.textContent = ''; } if (s === 'error' && code !== 'aborted') st.textContent = errText(code); },
    });
    if (ctl) setOn(true);
  });
  save.addEventListener('click', async () => {
    if (ctl) ctl.stop();
    const d = $('#vq-day', sh).value; const text = ta.value.trim(); if (!text) return;
    t.dayNotes = t.dayNotes || {};
    const prev = t.dayNotes[d] || '';
    t.dayNotes[d] = prev ? prev + '\n' + text : text;
    await DB.putTrip(t); App.closeSheet(true); App.rerender();
    toast(`${Render.dayLabel(d)} 이야기에 넣었어요`, 5000, { label: '되돌리기', run: async () => { if (prev) t.dayNotes[d] = prev; else delete t.dayNotes[d]; await DB.putTrip(t); App.rerender(); } });
  });
  setTimeout(() => mic.click(), 200); // 열자마자 바로 듣기
}

window.Voice = { supported, attachMic, quickNote, listen };
})();
