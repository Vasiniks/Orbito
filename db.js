// db.js (Hybrid Firestore + IndexedDB Adapter)
// Online: the first read of a store attaches a realtime onSnapshot listener;
// every read after that is served instantly from memory and stays fresh
// automatically (including your own writes, via latency compensation).
// Offline: a local IndexedDB store keeps the app fully usable with no cloud.

const LocalDB = {
  _db: null,
  init() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open('launchpad_local_db', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items', 'history', 'walk_logs', 'pending_actions', 'sessions'];
        stores.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async getStore(storeName, mode = 'readonly') {
    const db = await this.init();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },
  async getAll(storeName) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async getAllByIndex(storeName, indexName, value) {
    const items = await this.getAll(storeName);
    return items.filter(x => x[indexName] === value);
  },
  async put(storeName, data) {
    if (!data.id) {
      data.id = crypto.randomUUID ? crypto.randomUUID() : ("id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(data);
      req.onsuccess = () => resolve(data.id);
      req.onerror = () => reject(req.error);
    });
  },
  async add(storeName, data) {
    return this.put(storeName, data);
  },
  async delete(storeName, id) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  async clearStore(storeName) {
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;

    // In IndexedDB we can read and delete selectively
    const all = await this.getAll(storeName);
    for (const item of all) {
      if (storeName === 'users' && item.id === currentUid) {
        continue; // Preserve logged-in user
      }
      await this.delete(storeName, item.id);
    }
  }
};

const DB = {
  _cache: {},
  _ready: {},
  _unsubs: {},

  // Read-cost control: unbounded-growth collections (activity feed, session
  // logs) only sync their most recent slice instead of every doc ever written.
  _LISTENER_LIMITS: {
    history: { orderByField: 'timestamp', limit: 200 },
    sessions: { orderByField: 'startedAt', limit: 50 },
  },

  isOffline() {
    return !!window.__launchpad_offline || !window.fsdb || !window.FirebaseMethods;
  },

  getFs() {
    if (this.isOffline()) throw new Error("Local DB Mode active");
    if (!window.fsdb || !window.FirebaseMethods) throw new Error("Firebase not initialized");
    return { db: window.fsdb, f: window.FirebaseMethods };
  },

  _buildQuery(f, db, storeName) {
    const lim = this._LISTENER_LIMITS[storeName];
    if (lim && f.orderBy && f.limit) {
      return f.query(f.collection(db, storeName), f.orderBy(lim.orderByField, 'desc'), f.limit(lim.limit));
    }
    return f.query(f.collection(db, storeName));
  },

  _watch(storeName) {
    if (this._ready[storeName]) return this._ready[storeName];
    const { db, f } = this.getFs();
    this._ready[storeName] = new Promise((resolve, reject) => {
      let settled = false;
      this._unsubs[storeName] = f.onSnapshot(this._buildQuery(f, db, storeName), (snap) => {
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        this._cache[storeName] = results;
        if (!settled) { settled = true; resolve(); }
      }, (err) => {
        console.error(`Snapshot error for ${storeName}:`, err);
        if (this._unsubs[storeName]) { this._unsubs[storeName](); delete this._unsubs[storeName]; }
        delete this._ready[storeName];
        if (!settled) { settled = true; reject(err); }
      });
    });
    return this._ready[storeName];
  },

  async getAll(storeName) {
    if (this.isOffline()) {
      return LocalDB.getAll(storeName);
    }
    await this._watch(storeName);
    // Shallow copy so callers can sort/filter without disturbing the cache
    return [...(this._cache[storeName] || [])];
  },

  async getAllByIndex(storeName, indexName, value) {
    if (this.isOffline()) {
      return LocalDB.getAllByIndex(storeName, indexName, value);
    }
    const all = await this.getAll(storeName);
    return all.filter(item => item[indexName] === value);
  },

  async add(storeName, data) {
    if (this.isOffline()) {
      return LocalDB.add(storeName, data);
    }
    const { db, f } = this.getFs();
    if (!data.id) {
      // Auto-generate a guaranteed unique ID
      data.id = crypto.randomUUID ? crypto.randomUUID() : ("id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data);
    return data.id;
  },

  async put(storeName, data) {
    if (this.isOffline()) {
      return LocalDB.put(storeName, data);
    }
    const { db, f } = this.getFs();
    if (!data.id) throw new Error("ID required for put");
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data, { merge: true });
    return data.id;
  },

  // Full-document replace (no merge). setDoc merges never REMOVE map keys, so
  // docs holding maps the user can delete from (Configure's colors) must be
  // written whole — otherwise deleted entries resurrect on the next reload.
  async putReplace(storeName, data) {
    if (this.isOffline()) {
      return LocalDB.put(storeName, data);
    }
    const { db, f } = this.getFs();
    if (!data.id) throw new Error("ID required for put");
    await f.setDoc(f.doc(db, storeName, data.id), data);
    return data.id;
  },

  async delete(storeName, id) {
    if (this.isOffline()) {
      return LocalDB.delete(storeName, id);
    }
    const { db, f } = this.getFs();
    const docRef = f.doc(db, storeName, id);
    await f.deleteDoc(docRef);
  },

  async clearStore(storeName) {
    if (this.isOffline()) {
      return LocalDB.clearStore(storeName);
    }
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const batch = f.writeBatch(db);
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    snap.forEach(doc => {
      if (storeName === 'users' && doc.id === currentUid) {
        return; // Preserve the current logged-in user from lockout
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  async addPendingAction(actionData) {
    // actionData should be { actionType: 'create'|'update'|'delete', targetCollection, targetId, data, requestedBy, timestamp }
    if (!actionData.id) {
      actionData.id = crypto.randomUUID ? crypto.randomUUID() : ("pend_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    if (this.isOffline()) {
      return LocalDB.put('pending_actions', actionData);
    }
    const { db, f } = this.getFs();
    const docRef = f.doc(db, 'pending_actions', actionData.id);
    await f.setDoc(docRef, actionData);
    return actionData.id;
  },

  async exportAll(options = {}) {
    const excludePII = !!options.excludePII;
    const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items'];
    const data = {
      _metadata: {
        version: 2,
        piiIncluded: !excludePII,
        exportDate: new Date().toISOString(),
        app: 'Orbito'
      }
    };
    for (const store of stores) {
      let records = await this.getAll(store);
      if (excludePII) {
        if (store === 'users') {
          records = records.map(({ email, contact, pin, ...rest }) => rest);
        }
        if (store === 'vendors') {
          records = records.map(({ contact, ...rest }) => rest);
        }
      }
      data[store] = records;
    }
    return data;
  },

  async importAll(data) {
    let currentUserDoc = null;
    const currentUid = window.AuthModule?.currentUser?.uid || window.AuthModule?.currentUser?.id;
    if (currentUid && !this.isOffline()) {
      try {
        const { db, f } = this.getFs();
        const snap = await f.getDoc(f.doc(db, 'users', currentUid));
        if (snap.exists()) {
          currentUserDoc = snap.data();
        }
      } catch (e) {
        console.warn("Could not fetch current user to preserve:", e);
      }
    } else if (currentUid && this.isOffline()) {
      const allUsers = await LocalDB.getAll('users');
      currentUserDoc = allUsers.find(u => u.id === currentUid);
    }

    const storesToClear = ['parts', 'projects', 'tasks', 'bom_items', 'tools', 'locations'];
    for (const store of storesToClear) {
      await this.clearStore(store);
    }
    // Ignore internal metadata block during import (it's an export annotation only).
    for (const store of Object.keys(data)) {
      if (store === '_metadata') continue;
      if (store === 'users' || store === 'vendors' || store === 'settings') {
        continue; // Skip importing/overwriting these to keep existing people and shop data!
      }
      if (Array.isArray(data[store])) {
        for (const item of data[store]) {
          await this.put(store, item);
        }
      }
    }

    // Restore current user if they were deleted. Preserve their original role/status
    // so we don't accidentally privilege-escalate a Student or Lead to Mentor.
    if (currentUserDoc && currentUid) {
      await this.put('users', {
        id: currentUid,
        ...currentUserDoc,
        status: currentUserDoc.status || 'approved',
        role: currentUserDoc.role || 'Student'
      });
    }
  }
};

window.DB = DB;
window.LocalDB = LocalDB;
