// db.js (Cloud Firestore Adapter)
const DB = {
  getFs() {
    if (!window.fsdb || !window.FirebaseMethods) throw new Error("Firebase not initialized");
    return { db: window.fsdb, f: window.FirebaseMethods };
  },

  async getAll(storeName) {
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async getAllByIndex(storeName, indexName, value) {
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName), f.where(indexName, '==', value));
    const snap = await f.getDocs(q);
    const results = [];
    snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
  },

  async add(storeName, data) {
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
    const { db, f } = this.getFs();
    if (!data.id) throw new Error("ID required for put");
    const docRef = f.doc(db, storeName, data.id);
    await f.setDoc(docRef, data, { merge: true });
    return data.id;
  },

  async delete(storeName, id) {
    const { db, f } = this.getFs();
    const docRef = f.doc(db, storeName, id);
    await f.deleteDoc(docRef);
  },

  async clearStore(storeName) {
    const { db, f } = this.getFs();
    const q = f.query(f.collection(db, storeName));
    const snap = await f.getDocs(q);
    const batch = f.writeBatch(db);
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  },

  async addPendingAction(actionData) {
    const { db, f } = this.getFs();
    // actionData should be { actionType: 'create'|'update'|'delete', targetCollection, targetId, data, requestedBy, timestamp }
    if (!actionData.id) {
      actionData.id = crypto.randomUUID ? crypto.randomUUID() : ("pend_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
    }
    const docRef = f.doc(db, 'pending_actions', actionData.id);
    await f.setDoc(docRef, actionData);
    return actionData.id;
  },

  async exportAll() {
    const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'people', 'tasks', 'settings'];
    const data = {};
    for (const store of stores) {
      data[store] = await this.getAll(store);
    }
    return data;
  },

  async importAll(data) {
    const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings'];
    for (const store of stores) {
      await this.clearStore(store);
    }
    for (const store of Object.keys(data)) {
      if (Array.isArray(data[store])) {
        for (const item of data[store]) {
          await this.put(store, item);
        }
      }
    }
  }
};

window.DB = DB;
