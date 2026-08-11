/** Minimal promise wrapper over IndexedDB.
 * Stores: 'state' (whole AppState doc under key 'app'), 'photos' (compressed JPEG blobs by id).
 * Writes hit this local store first; the sync queue tracks what still needs the portal.
 */

const DB_NAME = 'agnvet-trialwork'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state')
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export const idb = {
  getState: <T>(): Promise<T | undefined> => tx('state', 'readonly', (s) => s.get('app') as IDBRequest<T | undefined>),
  putState: (value: unknown): Promise<IDBValidKey> => tx('state', 'readwrite', (s) => s.put(value, 'app')),
  clearState: (): Promise<undefined> => tx('state', 'readwrite', (s) => s.delete('app') as IDBRequest<undefined>),
  putPhoto: (id: string, blob: Blob): Promise<IDBValidKey> => tx('photos', 'readwrite', (s) => s.put(blob, id)),
  getPhoto: (id: string): Promise<Blob | undefined> => tx('photos', 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>),
  deletePhoto: (id: string): Promise<undefined> => tx('photos', 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>),
  photoCount: (): Promise<number> => tx('photos', 'readonly', (s) => s.count()),
  clearPhotos: (): Promise<undefined> => tx('photos', 'readwrite', (s) => s.clear() as IDBRequest<undefined>),
}
