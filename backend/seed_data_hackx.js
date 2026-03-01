const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./config/serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// ----------------------------------------------------------------------------
// 1. Branches to Seed
// ----------------------------------------------------------------------------
const branches = [
    { id: 'Mumbai', name: 'Pizza Hut Mumbai', location: 'Mumbai' },
    { id: 'Navi Mumbai', name: 'Pizza Hut Navi Mumbai', location: 'Navi Mumbai' },
    { id: 'Thane', name: 'Pizza Hut Thane', location: 'Thane' },
    { id: 'Pune', name: 'Pizza Hut Pune', location: 'Pune' },
    { id: 'Indore', name: 'Pizza Hut Indore', location: 'Indore' }
];

// ----------------------------------------------------------------------------
// 2. Reviews to Seed (Subset of the 50 from models.ts to ensure script is robust and correctly populated)
// ----------------------------------------------------------------------------
const reviews = [
    // --- Mumbai ---
    { branchId: 'Mumbai', authorName: 'Rahul Sharma', rating: 5, reviewText: 'Had a wonderful experience at the Pizza Hut Mumbai outlet...', sentiment: 'positive', category: 'Food' },
    { branchId: 'Mumbai', authorName: 'Priya Desai', rating: 4, reviewText: 'Satisfying experience with cheese burst pizza!', sentiment: 'positive', category: 'Service' },
    { branchId: 'Mumbai', authorName: 'Amit Patel', rating: 2, reviewText: 'Service took longer, pizza was cold.', sentiment: 'negative', category: 'Service' },

    // --- Navi Mumbai ---
    { branchId: 'Navi Mumbai', authorName: 'Saurabh Kulkarni', rating: 5, reviewText: 'Fantastic experience at Navi Mumbai outlet.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Navi Mumbai', authorName: 'Meera Shah', rating: 4, reviewText: 'Good taste and quick takeaway.', sentiment: 'positive', category: 'Service' },
    { branchId: 'Navi Mumbai', authorName: 'Arjun Malhotra', rating: 2, reviewText: 'Toppings were uneven and crust chewy.', sentiment: 'negative', category: 'Food' },

    // --- Thane ---
    { branchId: 'Thane', authorName: 'Manish Gupta', rating: 5, reviewText: 'Excellent experience at Thane outlet.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Thane', authorName: 'Aisha Khan', rating: 4, reviewText: 'Loved the ambience and comfortable seating.', sentiment: 'positive', category: 'Ambience' },
    { branchId: 'Thane', authorName: 'Ritesh Jain', rating: 2, reviewText: 'Pizza was lukewarm and slow service.', sentiment: 'negative', category: 'Service' },

    // --- Pune ---
    { branchId: 'Pune', authorName: 'Mitali Das', rating: 5, reviewText: 'Outstanding experience at Pune outlet.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Pune', authorName: 'Ankit Tiwari', rating: 4, reviewText: 'Garlic bread was crispy and delicious.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Pune', authorName: 'Shruti Kulkarni', rating: 2, reviewText: 'Pizza crust felt dry and slow service.', sentiment: 'negative', category: 'Service' },

    // --- Indore ---
    { branchId: 'Indore', authorName: 'Abhishek Nair', rating: 5, reviewText: 'Great taste and perfect portion size.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Indore', authorName: 'Komal Shah', rating: 4, reviewText: 'Loved the cheese burst and overall flavor.', sentiment: 'positive', category: 'Food' },
    { branchId: 'Indore', authorName: 'Parth Desai', rating: 2, reviewText: 'Pizza was slightly overcooked and cold.', sentiment: 'negative', category: 'Food' }
];

async function seed() {
    console.log('--- START SEEDING ---');

    // Seed Branches
    for (const b of branches) {
        const docRef = db.collection('branches').doc(b.id);
        const data = {
            name: b.name,
            location: b.location,
            managerId: 'default_manager',
            status: 'active',
            totalReviews: 3,
            averageRating: 3.6,
            positiveReviews: 2,
            negativeReviews: 1,
            createdAt: admin.firestore.Timestamp.now()
        };
        await docRef.set(data, { merge: true });
        console.log(`- Seeded Branch: ${b.name} (${b.id})`);
    }

    // Seed Reviews with varied timestamps
    let reviewCount = 0;
    const now = Date.now();
    for (const r of reviews) {
        // Variation: some today, some 2 days ago, some 5 days ago
        const offsetDays = Math.floor(Math.random() * 7);
        const data = {
            ...r,
            source: 'google',
            status: r.rating <= 2 ? 'critical' : 'normal',
            responseStatus: 'pending',
            sentimentScore: r.sentiment === 'positive' ? 0.9 : 0.2,
            createdAt: admin.firestore.Timestamp.fromMillis(now - (offsetDays * 24 * 60 * 60 * 1000)),
            isDeleted: false
        };
        await db.collection('reviews').add(data);
        reviewCount++;
    }

    console.log(`- Seeded ${reviewCount} Reviews successfully!`);
    console.log('--- SEED COMPLETE ---');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed Error:', err);
    process.exit(1);
});
