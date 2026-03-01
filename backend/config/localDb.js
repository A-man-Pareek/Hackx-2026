/**
 * Local JSON File Database - Drop-in replacement for Firestore during development
 * Stores data in a local JSON file so reviews persist across server restarts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'reviews.json');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Load existing data or initialize empty
function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('[LocalDB] Error loading database, resetting:', err.message);
    }
    return {};
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Mimics Firestore's db.collection('reviews').doc() pattern
 * Returns an object with { id, set(), update(), get() }
 */
function createDocRef(id) {
    const docId = id || crypto.randomUUID();
    return {
        id: docId,
        async set(data) {
            const db = loadDB();
            db[docId] = { ...data };
            saveDB(db);
        },
        async update(data) {
            const db = loadDB();
            if (!db[docId]) {
                throw new Error(`Document ${docId} not found`);
            }
            db[docId] = { ...db[docId], ...data };
            saveDB(db);
        },
        async get() {
            const db = loadDB();
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
function collection(name) {
    return {
        doc(id) {
            return createDocRef(id);
        },
        async add(data) {
            const ref = createDocRef();
            await ref.set(data);
            return ref;
        },
        where(field, op, value) {
            return {
                async get() {
                    const db = loadDB();
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
                    // Chained where
                    return {
                        async get() {
                            const db = loadDB();
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
 * Get all reviews (for the GET endpoint)
 */
function getAllReviews() {
    const db = loadDB();
    return Object.entries(db).map(([id, data]) => ({ id, ...data }));
}

const localDb = {
    collection
};

module.exports = { localDb, getAllReviews };
