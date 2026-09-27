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
  const print = await resizeTo(bmp, 3000, 0.9);
  const disp = await resizeTo(bmp, 1600, 0.86);
  const thumb = await resizeTo(bmp, 480, 0.8);
  if (bmp.close) bmp.close();
  return { w, h, print, disp, thumb };
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

window.Meta = { readPhotoInfo, makeImages, placeFor, loadCities, sortPhotos, assignTrips, absTime, dayOf, dayDiff, parseExifDate, parseOffset };
