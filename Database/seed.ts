import { mockReviews } from './models';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin (adjust path as needed)
const serviceAccount = JSON.parse(
    readFileSync('../backend/config/serviceAccountKey.json', 'utf8')
);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function seedData() {
    console.log('Seeding reviews collection...');
    let count = 0;
    for (const review of mockReviews) {
        try {
            // Create a clean object, translating Timestamp correctly for Admin SDK
            const data = { ...review };

            // We convert client Timestamp (which models.ts provides) into Admin server timestamp
            // or Date depending on what models.ts returns. 
            // Models.ts returns a Timestamp object from "firebase/firestore" which might be mocked or real.
            // Usually, it has seconds and nanoseconds, or toDate() method.
            let createdAtStr: Date;
            if (typeof review.createdAt.toDate === 'function') {
                createdAtStr = review.createdAt.toDate();
            } else if (review.createdAt && typeof (review.createdAt as any).seconds === 'number') {
                createdAtStr = new Date((review.createdAt as any).seconds * 1000);
            } else {
                createdAtStr = new Date(); // fallback
            }

            data.createdAt = admin.firestore.Timestamp.fromDate(createdAtStr);

            await db.collection('reviews').add(data);
            count++;
        } catch (err) {
            console.error('Error adding document:', err.message);
        }
    }
    console.log(`Successfully imported ${count} reviews!`);
}

seedData();
