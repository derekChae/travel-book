// 사진에서 찍은 시각·위치 꺼내기, 화면용 사진 만들기, 장소 이름 찾기, 여행 자동 묶기
const regionName = (() => { try { return new Intl.DisplayNames(['ko'], { type: 'region' }); } catch { return null; } })();

// ---------- 찍은 시각 / 위치 ----------
function parseExifDate(raw) {
  // "2026:05:10 09:01:22" -> "2026-05-10T09:01:22" (찍은 곳의 시각 그대로, 변환하지 않음)
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}`;
}
function parseOffset(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.trim().match(/^([+-])(\d{2}):?(\d{2})$/);
  return m ? `${m[1]}${m[2]}:${m[3]}` : null;
}

async function readPhotoInfo(file) {
  const info = { taken: null, offset: null, timeSource: null, lat: null, lon: null, camera: null };
  try {
    const x = await exifr.parse(file, { tiff: true, exif: true, gps: false, reviveValues: false, translateValues: false,
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate', 'OffsetTime', 'Make', 'Model'] });
    if (x) {
      const t = parseExifDate(x.DateTimeOriginal);
      if (t) { info.taken = t; info.offset = parseOffset(x.OffsetTimeOriginal) || parseOffset(x.OffsetTime); info.timeSource = 'exif'; }
      info.camera = [x.Make, x.Model].filter(Boolean).join(' ').trim() || null;
    }
  } catch (e) { /* 정보가 없는 사진 */ }
  try {
    const g = await exifr.gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) {
      info.lat = +g.latitude.toFixed(5); info.lon = +g.longitude.toFixed(5);
    }
  } catch (e) { /* 위치 없음 */ }
  return info;
}

// ---------- 화면용 사진 ----------
async function decodeImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 아래로 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function resizeTo(src, max, quality) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * s), h = Math.round(h0 * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
}
async function makeImages(file) {
  const bmp = await decodeImage(file);
  const w = bmp.width, h = bmp.height;
  // 원본은 폰 갤러리에 그대로 있으니 다시 저장하지 않음. 화면용 / 책 인쇄용 / 작은 미리보기만 만듦
  const print = await resizeTo(bmp, 4096, 0.92);
  const disp = await resizeTo(bmp, 2048, 0.9);
  const thumb = await resizeTo(bmp, 480, 0.8);
  const tone = toneOf(bmp);
  if (bmp.close) bmp.close();
  return { w, h, print, disp, thumb, tone };
}


// ---------- 사진의 대표 색 (배경을 사진 색으로 물들이는 데 씀) ----------
function toneOf(src) {
  try {
    const c = document.createElement('canvas'); c.width = 24; c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data; const px = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2]; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const l = (mx + mn) / 2; if (l < 25 || l > 240) continue;
      px.push([r, gg, b, mx === 0 ? 0 : (mx - mn) / mx]);
    }
    if (!px.length) return [128, 128, 128];
    px.sort((a, b) => b[3] - a[3]); const top = px.slice(0, Math.max(8, Math.round(px.length * 0.3)));
    const avg = k => Math.round(top.reduce((s, p) => s + p[k], 0) / top.length);
    return [avg(0), avg(1), avg(2)];
  } catch { return null; }
}

// ---------- 영상 ----------
const VIDEO_RE = /\.(mp4|mov|m4v|webm|3gp)$/i;
const isVideo = f => /^video\//.test(f.type) || VIDEO_RE.test(f.name);

// 파일 이름 속 촬영 시각 (갤럭시: 20260510_090122.mp4 = 찍은 곳 시각)
function timeFromName(name) {
  const m = name.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m || /^PXL_/.test(name)) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
function findBytes(u8, pat) {
  outer: for (let i = 0; i <= u8.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (u8[i + j] !== pat[j]) continue outer; return i; }
  return -1;
}
// MP4/MOV 안의 생성 시각(mvhd, 세계 표준시)과 위치(©xyz)
async function mp4Meta(file) {
  const out = { utc: null, lat: null, lon: null };
  const parts = [file.slice(0, Math.min(file.size, 2 << 20))];
  if (file.size > 2 << 20) parts.push(file.slice(Math.max(0, file.size - (6 << 20))));
  for (const part of parts) {
    const u8 = new Uint8Array(await part.arrayBuffer());
    if (!out.utc) {
      const i = findBytes(u8, [0x6d, 0x76, 0x68, 0x64]); // 'mvhd'
      if (i > 0 && i + 16 < u8.length) {
        const dv = new DataView(u8.buffer, u8.byteOffset + i + 4); const ver = dv.getUint8(0);
        const secs = ver === 1 ? Number(dv.getBigUint64(4)) : dv.getUint32(4);
        if (secs > 0) { const ms = (secs - 2082844800) * 1000; if (ms > Date.UTC(2000, 0, 1) && ms < Date.UTC(2100, 0, 1)) out.utc = ms; }
      }
    }
    if (out.lat == null) {
      const j = findBytes(u8, [0xa9, 0x78, 0x79, 0x7a]); // '©xyz'
      if (j > 0) {
        const s = new TextDecoder('latin1').decode(u8.subarray(j + 4, j + 60));
        const mm = s.match(/([+-]\d{1,2}\.\d+)([+-]\d{1,3}\.\d+)/);
        if (mm) { const la = +mm[1], lo = +mm[2]; if (!(la === 0 && lo === 0)) { out.lat = +la.toFixed(5); out.lon = +lo.toFixed(5); } }
      }
    }
  }
  return out;
}
function localFromUtc(ms, offset) {
  const sign = offset[0] === '-' ? -1 : 1; const [hh, mm] = offset.slice(1).split(':').map(Number);
  return new Date(ms + sign * (hh * 60 + mm) * 60000).toISOString().slice(0, 19);
}
async function readVideoInfo(file, offsetGuess) {
  const info = { taken: null, offset: null, timeSource: null, lat: null, lon: null, camera: null };
  const byName = timeFromName(file.name);
  let meta = { utc: null, lat: null, lon: null };
  try { meta = await mp4Meta(file); } catch { }
  if (byName) { info.taken = byName; info.offset = offsetGuess || null; info.timeSource = 'filename'; }
  else if (meta.utc) {
    if (offsetGuess) { info.taken = localFromUtc(meta.utc, offsetGuess); info.offset = offsetGuess; }
    else { info.taken = new Date(meta.utc).toISOString().slice(0, 19); info.offset = '+00:00'; }
    info.timeSource = 'video';
  }
  info.lat = meta.lat; info.lon = meta.lon;
  return info;
}
// 영상 길이·크기와 대표 장면(포스터)
async function makeVideoImages(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('영상을 열 수 없어요')); setTimeout(() => rej(new Error('영상 읽기 시간 초과')), 15000); });
    const duration = isFinite(v.duration) ? v.duration : 0;
    const t = duration ? Math.min(duration * 0.3, 2) : 0;
    await new Promise(res => { v.onseeked = res; v.currentTime = t; setTimeout(res, 4000); });
    const w = v.videoWidth || 1280, h = v.videoHeight || 720;
    const src = document.createElement('canvas'); src.width = w; src.height = h; src.getContext('2d').drawImage(v, 0, 0, w, h);
    const print = await resizeTo(src, 3000, 0.9), disp = await resizeTo(src, 1600, 0.86), thumb = await resizeTo(src, 480, 0.8);
    return { w, h, duration, print, disp, thumb, tone: toneOf(src) };
  } finally { URL.revokeObjectURL(url); }
}


// 원본을 가리킬 수 없을 때만: 고른 장면부터 6초짜리 작은 미리보기 영상을 만들어 저장 (소리 포함, 약 1MB)
async function makePreviewClip(file, start = 0, len = 6) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const url = URL.createObjectURL(file);
  const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = url;
  // 화면 밖에서도 영상이 계속 디코딩되도록 아주 작게 붙여 둠
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1'; document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(rej, 15000); });
    const d = isFinite(v.duration) ? v.duration : len; const s = Math.max(0, Math.min(start, d - Math.min(len, d)));
    const sc = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * sc) & ~1; c.height = Math.round(v.videoHeight * sc) & ~1;
    const g = c.getContext('2d'); const tracks = [...c.captureStream(24).getVideoTracks()];
    // 소리: 화면에선 음소거로 재생하되 영상의 소리 트랙은 그대로 담음 (사용자 터치 없이도 동작)
    v.muted = true; let ac = null;
    try { const cs = (v.captureStream || v.mozCaptureStream).call(v); setTimeout(() => {}, 0); tracks.push(...cs.getAudioTracks()); v._cs = cs; } catch { }
    await new Promise(r => { v.onseeked = r; v.currentTime = s; setTimeout(r, 4000); });
    await Promise.race([v.play().catch(() => { }), new Promise(r => setTimeout(r, 3000))]);
    await new Promise(r => setTimeout(r, 120));
    if (v._cs) v._cs.getAudioTracks().forEach(t => { if (!tracks.includes(t)) tracks.push(t); });
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : {});
    const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.start(250);
    const end = s + Math.min(len, d - s);
    await new Promise(r => {
      const iv = setInterval(() => { g.drawImage(v, 0, 0, c.width, c.height); if (v.currentTime >= end || v.ended) { clearInterval(iv); r(); } }, 1000 / 30);
      setTimeout(() => { clearInterval(iv); r(); }, (len + 4) * 1000);
    });
    v.pause(); if (rec.state !== 'inactive') rec.stop(); await Promise.race([new Promise(r => rec.onstop = r), new Promise(r => setTimeout(r, 4000))]);
    if (!chunks.length) return null;
    return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
  } catch (e) { console.warn('preview clip failed', e); return null; }
  finally { v.remove(); URL.revokeObjectURL(url); }
}

// ---------- 장소 이름 (기기 안에 있는 도시 목록으로 찾음, 인터넷 안 씀) ----------
let _cities = null;
async function loadCities() {
  if (_cities) return _cities;
  const txt = await (await fetch('data/cities.txt')).text();
  const grid = new Map();
  for (const line of txt.split('\n')) {
    const [name, cc, la, lo] = line.split('|');
    const lat = +la, lon = +lo; if (!Number.isFinite(lat)) continue;
    const k = Math.floor(lat) + ',' + Math.floor(lon);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ name, cc, lat, lon });
  }
  _cities = grid; return grid;
}
function distKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function placeFor(lat, lon) {
  if (lat == null || lon == null) return null;
  const grid = await loadCities();
  let best = null, bd = Infinity;
  const fl = Math.floor(lat), fo = Math.floor(lon);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const c of grid.get((fl + i) + ',' + (fo + j)) || []) {
      const d = distKm(lat, lon, c.lat, c.lon); if (d < bd) { bd = d; best = c; }
    }
  }
  if (!best || bd > 80) return { name: null, country: null, near: false };
  return { name: best.name, country: (regionName && regionName.of(best.cc)) || best.cc, cc: best.cc, near: bd > 20 };
}

// ---------- 시간 정렬 / 여행 묶기 ----------
function absTime(p) { // 정렬용 숫자. 시간대가 있으면 절대시각, 없으면 찍힌 곳 시각 그대로
  if (!p.taken) return null;
  const base = Date.parse(p.taken + 'Z');
  if (!p.offset) return base;
  const sign = p.offset[0] === '-' ? -1 : 1; const [hh, mm] = p.offset.slice(1).split(':').map(Number);
  return base - sign * (hh * 60 + mm) * 60000;
}
const dayOf = p => p.taken ? p.taken.slice(0, 10) : null;
function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

function sortPhotos(list) {
  return [...list].sort((a, b) => {
    const ta = absTime(a), tb = absTime(b);
    if (ta == null && tb == null) return (a.addedSeq || 0) - (b.addedSeq || 0);
    if (ta == null) return 1; if (tb == null) return -1;
    return ta - tb || (a.addedSeq || 0) - (b.addedSeq || 0);
  });
}

// 새 사진들을 기존 여행에 넣거나, 날짜가 이어지는 것끼리 새 여행으로 묶음
function assignTrips(newPhotos, trips, allPhotos, makeTrip) {
  const ranges = new Map(); // tripId -> {start,end}
  for (const p of allPhotos) {
    const d = dayOf(p); if (!d || !p.tripId) continue;
    const r = ranges.get(p.tripId) || { start: d, end: d };
    if (d < r.start) r.start = d; if (d > r.end) r.end = d; ranges.set(p.tripId, r);
  }
  const touched = new Set(); const created = [];
  const dated = sortPhotos(newPhotos.filter(p => p.taken));
  let current = null; // 이번에 새로 만든 여행
  for (const p of dated) {
    const d = dayOf(p);
    let hit = null;
    for (const [id, r] of ranges) { if (dayDiff(r.end, d) <= 2 && dayDiff(d, r.start) <= 2) { hit = id; break; } }
    if (!hit) {
      const t = makeTrip(); created.push(t); trips.push(t); hit = t.id;
      ranges.set(hit, { start: d, end: d });
    }
    const r = ranges.get(hit); if (d < r.start) r.start = d; if (d > r.end) r.end = d;
    p.tripId = hit; touched.add(hit); current = hit;
  }
  // 날짜 없는 사진: 이번에 함께 고른 사진이 가장 많이 들어간 여행으로, 없으면 '날짜 모르는 사진'
  const undated = newPhotos.filter(p => !p.taken);
  if (undated.length) {
    const counts = {}; dated.forEach(p => counts[p.tripId] = (counts[p.tripId] || 0) + 1);
    let target = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (!target) {
      let t = trips.find(x => x.undatedBin);
      if (!t) { t = makeTrip(); t.undatedBin = true; t.title = '날짜 모르는 사진'; created.push(t); trips.push(t); }
      target = t.id;
    }
    undated.forEach(p => { p.tripId = target; }); touched.add(target);
  }
  return { touched, created };
}

window.Meta = { makePreviewClip, toneOf, isVideo, readVideoInfo, makeVideoImages, mp4Meta, timeFromName, readPhotoInfo, makeImages, placeFor, loadCities, sortPhotos, assignTrips, absTime, dayOf, dayDiff, parseExifDate, parseOffset };
