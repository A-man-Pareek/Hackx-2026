/**
 * Local JSON File Database - Drop-in replacement for Firestore during development
 * Stores data in collection-specific JSON files so data is isolated and persists across server restarts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

/**
 * Load existing data or initialize empty for a specific collection
 */
function loadDB(collectionName) {
    const filePath = path.join(DB_DIR, `${collectionName}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error(`[LocalDB] Error loading database for ${collectionName}, resetting:`, err.message);
    }
    return {};
}

/**
 * Save data for a specific collection
 */
function saveDB(collectionName, data) {
    const filePath = path.join(DB_DIR, `${collectionName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Mimics Firestore's db.collection('name').doc() pattern
 */
function createDocRef(collectionName, id) {
    const docId = id || crypto.randomUUID();
    return {
        id: docId,
        async set(data) {
            const db = loadDB(collectionName);
            db[docId] = { ...data };
            saveDB(collectionName, db);
        },
        async update(data) {
            const db = loadDB(collectionName);
            if (!db[docId]) {
                throw new Error(`Document ${docId} not found in ${collectionName}`);
            }
            db[docId] = { ...db[docId], ...data };
            saveDB(collectionName, db);
        },
        async get() {
            const db = loadDB(collectionName);
            const data = db[docId] || null;
            return {
                exists: !!data,
                id: docId,
                data: () => data
            };
        }
    };
}

/**
 * Mimics Firestore's db.collection('collectionName') pattern
 */
function collection(collectionName) {
    return {
        doc(id) {
            return createDocRef(collectionName, id);
        },
        async add(data) {
            const ref = createDocRef(collectionName);
            await ref.set(data);
            return ref;
        },
        where(field, op, value) {
            return {
                async get() {
                    const db = loadDB(collectionName);
                    const results = [];
                    for (const [id, doc] of Object.entries(db)) {
                        let match = false;
                        if (op === '==' && doc[field] === value) match = true;
                        if (match) results.push({ id, data: () => doc });
                    }
                    return {
                        empty: results.length === 0,
                        forEach(cb) { results.forEach(cb); },
                        docs: results
                    };
                },
                where(field2, op2, value2) {
                    return {
                        async get() {
                            const db = loadDB(collectionName);
                            const results = [];
                            for (const [id, doc] of Object.entries(db)) {
                                let match1 = false, match2 = false;
                                if (op === '==' && doc[field] === value) match1 = true;
                                if (op2 === '==' && doc[field2] === value2) match2 = true;
                                if (match1 && match2) results.push({ id, data: () => doc });
                            }
                            return {
                                empty: results.length === 0,
                                forEach(cb) { results.forEach(cb); },
                                docs: results
                            };
                        }
                    };
                }
            };
        }
    };
}

/**
 * Get all data for a specific collection
 */
function getAll(collectionName) {
    const db = loadDB(collectionName);
    return Object.entries(db).map(([id, data]) => ({ id, ...data }));
}

const localDb = {
    collection
};

module.exports = { localDb, getAll };

