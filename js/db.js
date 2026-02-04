/**
 * IndexedDB Wrapper for SMS Labeling Studio
 * Handles 10k+ records with ease.
 */

const DB_NAME = 'SmsLabelingDB';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_META = 'metadata';

class SMSDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_ITEMS)) {
                    // ID is key, but we index by status for filtering
                    const store = db.createObjectStore(STORE_ITEMS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('status', 'status', { unique: false }); // 'new', 'done', 'skipped'
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('DB Initialized');
                resolve();
            };

            request.onerror = (event) => {
                console.error('DB Error', event);
                reject(event);
            };
        });
    }

    async clearAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([STORE_ITEMS, STORE_META], 'readwrite');
            tx.objectStore(STORE_ITEMS).clear();
            tx.objectStore(STORE_META).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = reject;
        });
    }

    // Bulk Import (Formatted as { original: smsObject, label: {}, status: 'new' })
    async importBulk(items) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([STORE_ITEMS, STORE_META], 'readwrite');
            const store = tx.objectStore(STORE_ITEMS);

            items.forEach(item => store.add(item));

            // Store Metadata
            tx.objectStore(STORE_META).put({ key: 'import_info', count: items.length, date: new Date().toISOString() });

            tx.oncomplete = () => resolve();
            tx.onerror = reject;
        });
    }

    async getPage(pageIndex, pageSize) {
        // Since IDB cursor skipping is slow for large offsets, 
        // we use a simple range query assuming keys are sequential integers 1..N
        // This is a simplification for performance.

        const start = pageIndex * pageSize + 1; // 1-based IDs
        const end = start + pageSize;
        const range = IDBKeyRange.bound(start, end, false, true); // [start, end)

        return new Promise((resolve, reject) => {
            const store = this.db.transaction(STORE_ITEMS, 'readonly').objectStore(STORE_ITEMS);
            const request = store.openCursor(range);
            const data = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    data.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(data);
                }
            };
            request.onerror = reject;
        });
    }

    async getItem(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_ITEMS, 'readonly');
            const req = tx.objectStore(STORE_ITEMS).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
    }

    async updateItem(id, updates) {
        // updates = { label: {...}, status: 'done' }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_ITEMS, 'readwrite');
            const store = tx.objectStore(STORE_ITEMS);

            store.get(id).onsuccess = (e) => {
                const data = e.target.result;
                const newData = { ...data, ...updates };
                store.put(newData);
            };

            tx.oncomplete = () => resolve();
            tx.onerror = reject;
        });
    }

    async getAllExport() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_ITEMS, 'readonly');
            const req = tx.objectStore(STORE_ITEMS).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
    }

    async getStats() {
        return new Promise((resolve) => {
            const tx = this.db.transaction(STORE_ITEMS, 'readonly');
            const store = tx.objectStore(STORE_ITEMS);
            const index = store.index('status');

            const reqDone = index.count('done');
            const reqSkipped = index.count('skipped');

            let done = 0;
            let skipped = 0;

            reqDone.onsuccess = () => {
                done = reqDone.result;
                reqSkipped.onsuccess = () => {
                    skipped = reqSkipped.result;
                    resolve({ done, skipped });
                };
            };
        });
    }

    async getCount() {
        return new Promise((resolve) => {
            const req = this.db.transaction(STORE_ITEMS, 'readonly').objectStore(STORE_ITEMS).count();
            req.onsuccess = () => resolve(req.result);
        });
    }
}

export const db = new SMSDB();
