// 저장소: 기기 안(IndexedDB)에만 저장. 서버로 보내지 않음.
const DB_NAME = 'travel-book';
const DB_VER = 2;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('trip', 'tripId');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(stores, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 취소됐어요'));
  }));
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

const DB = {
  async allTrips() { return tx(['trips'], 'readonly', t => reqP(t.objectStore('trips').getAll())); },
  async allPhotos() { return tx(['photos'], 'readonly', t => reqP(t.objectStore('photos').getAll())); },
  async putTrip(trip) { return tx(['trips'], 'readwrite', t => { t.objectStore('trips').put(trip); }); },
  async putPhoto(p) { return tx(['photos'], 'readwrite', t => { t.objectStore('photos').put(p); }); },
  async getBlob(key) { return tx(['blobs'], 'readonly', t => reqP(t.objectStore('blobs').get(key))); },
  // 사진 여러 장 + 여행 정보를 한 번에 저장. 중간에 실패하면 전부 취소됨.
  async saveImport({ trips, photos, blobs }) {
    return tx(['trips', 'photos', 'blobs'], 'readwrite', t => {
      trips.forEach(x => t.objectStore('trips').put(x));
      photos.forEach(x => t.objectStore('photos').put(x));
      blobs.forEach(([k, v]) => t.objectStore('blobs').put(v, k));
    });
  },
  async deletePhoto(id) {
    return tx(['photos', 'blobs'], 'readwrite', t => {
      t.objectStore('photos').delete(id);
      ['orig', 'print', 'disp', 'thumb', 'video', 'vhandle', 'ohandle'].forEach(k => t.objectStore('blobs').delete(id + ':' + k));
    });
  },
  async getMeta(k) { return tx(['meta'], 'readonly', t => reqP(t.objectStore('meta').get(k))); },
  async setMeta(k, v) { return tx(['meta'], 'readwrite', t => { t.objectStore('meta').put(v, k); }); },
  async deleteTrip(id) { return tx(['trips'], 'readwrite', t => { t.objectStore('trips').delete(id); }); },
  async clearAll() {
    return tx(['trips', 'photos', 'blobs'], 'readwrite', t => {
      ['trips', 'photos', 'blobs'].forEach(s => t.objectStore(s).clear());
    });
  },
};

window.DB = DB;
