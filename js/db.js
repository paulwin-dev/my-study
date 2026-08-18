// Minimal promise-based IndexedDB wrapper.
// Two stores: "classes" and "notes". Note images are stored as compressed
// JPEG Blobs directly in IndexedDB (no server, everything stays on-device).

const DB_NAME = "study-scanner";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("classes")) {
        const store = db.createObjectStore("classes", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("classId", "classId");
        store.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const DB = {
  // ---- Classes ----
  async listClasses() {
    return tx("classes", "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const items = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) {
            items.push(cur.value);
            cur.continue();
          } else {
            items.sort((a, b) => a.createdAt - b.createdAt);
            resolve(items);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }).then((p) => p);
  },

  async addClass(name, color) {
    const cls = { id: uid(), name, color, createdAt: Date.now() };
    await tx("classes", "readwrite", (store) => store.put(cls));
    return cls;
  },

  async deleteClass(classId) {
    const notes = await this.listNotes(classId);
    await tx("notes", "readwrite", (store) => {
      notes.forEach((n) => store.delete(n.id));
    });
    await tx("classes", "readwrite", (store) => store.delete(classId));
  },

  // ---- Notes ----
  async listNotes(classId) {
    return tx("notes", "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const idx = store.index("classId");
        const items = [];
        const req = idx.openCursor(IDBKeyRange.only(classId));
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) {
            items.push(cur.value);
            cur.continue();
          } else {
            items.sort((a, b) => a.date.localeCompare(b.date));
            resolve(items);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }).then((p) => p);
  },

  async addNote({ classId, date, imageBlob, ocrText }) {
    const note = {
      id: uid(),
      classId,
      date, // "YYYY-MM-DD"
      imageBlob,
      ocrText,
      createdAt: Date.now(),
    };
    await tx("notes", "readwrite", (store) => store.put(note));
    return note;
  },

  async updateNoteText(noteId, ocrText) {
    const note = await tx("notes", "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(noteId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    if (!note) return;
    note.ocrText = ocrText;
    await tx("notes", "readwrite", (store) => store.put(note));
  },

  async deleteNote(noteId) {
    await tx("notes", "readwrite", (store) => store.delete(noteId));
  },
};
