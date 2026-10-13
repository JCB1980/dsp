// Stockage local (IndexedDB) : les données restent sur le poste, dans le
// navigateur. Un seul magasin clé → valeur : « entries » (affectations
// importées, en un bloc), « meta » (import) et « budgets » (jours vendus).
const DB_NAME = 'dsp-suivi-jours';
const STORE = 'kv';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(e => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    db =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const out = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaction annulée'));
      })
  );
}

export async function loadAll() {
  const out = {};
  await tx('readonly', store => {
    for (const key of ['entries', 'meta', 'budgets']) {
      const r = store.get(key);
      r.onsuccess = () => (out[key] = r.result);
    }
  });
  return { entries: out.entries || [], meta: out.meta || null, budgets: out.budgets || {} };
}

export function save(values) {
  return tx('readwrite', store => {
    for (const [k, v] of Object.entries(values)) store.put(v, k);
  });
}

export function clearData() {
  return tx('readwrite', store => {
    store.delete('entries');
    store.delete('meta');
  });
}
