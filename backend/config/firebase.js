const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Ideally, the service account credentials should be provided via environment variables.
// For example: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
// or by parsing a stringified JSON from process.env.FIREBASE_SERVICE_ACCOUNT

if (!admin.apps.length) {
    // If GOOGLE_APPLICATION_CREDENTIALS is set, admin.credential.applicationDefault() works automatically.
    // Otherwise, you can pass explicit credentials here.
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
    });
}

const db = admin.firestore();
const adminAuth = admin.auth();

module.exports = { admin, db, adminAuth };
