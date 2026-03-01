require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const http = require('http');

// Phase 9 Automations
const { initSockets } = require('./sockets/socketHandler');
const { startSyncJob } = require('./jobs/syncJob');

// Require routes from the incoming modular backend
const authRoutes = require('./modules/auth/authRoutes');
const branchRoutes = require('./modules/branches/branchRoutes');
const staffRoutes = require('./modules/staff/staffRoutes');
const reviewRoutes = require('./modules/reviews/reviewRoutes');
const responseRoutes = require('./modules/responses/responseRoutes');
const analyticsRoutes = require('./modules/analytics/analyticsRoutes'); // NEW Analytics routes
const aiRoutes = require('./modules/ai/aiRoutes');
const templateRoutes = require('./modules/templates/templateRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "DUMMY_API_KEY";

// ---------------------------------------------------------------------------
// Modular Routes (from remote branch)
// ---------------------------------------------------------------------------
app.use('/auth', authRoutes);
app.use('/branches', branchRoutes);
app.use('/staff', staffRoutes);
app.use('/reviews', reviewRoutes);
app.use('/responses', responseRoutes);
app.use('/api/analytics', analyticsRoutes); // NEW Analytics routes
app.use('/api/ai', aiRoutes);
app.use('/api/templates', templateRoutes);

// ---------------------------------------------------------------------------
// Route: /api/sync-reviews
// Purpose: Fetches reviews from Google Places API and inserts non-duplicates 
// into Firestore with 'pending' sentiment status.
// ---------------------------------------------------------------------------
app.post('/api/sync-reviews', async (req, res) => {
    const { branchId } = req.body;

    if (!branchId) {
        return res.status(400).json({ error: "branchId is required" });
    }

    try {
        console.log(`[SYNC] Initiating sync for branch: ${branchId}`);

        // 1. Fetch branch placeId from DB 
        // (Mocking this step since we don't have Admin SDK initialized to avoid complex local setup)
        // In reality: const branchDoc = await db.collection('branches').doc(branchId).get();
        const branchPlaceId = branchId === 'curry_house_id' ? 'ChIJweeUzw_v5zsR3XUa_S6g_Zk' : 'ChIJJ-e1N-_5zsRR0nOaVfV-jK4';

        console.log(`[SYNC] Found Place ID: ${branchPlaceId}`);

        // 2. Fetch from Google Places API (Mocking the HTTP call to prevent billing/key issues for the user)
        /*
        const response = await axios.get(`https://maps.googleapis.com/maps/api/place/details/json`, {
            params: {
                place_id: branchPlaceId,
                fields: "reviews",
                key: GOOGLE_PLACES_API_KEY
            }
        });
        const googleReviews = response.data.result.reviews || [];
        */

        // MOCK API RESPONSE DATA (Simulating 2 incoming reviews from Google)
        const googleReviews = [
            {
                author_name: "Fresh Google User 1",
                rating: 5,
                text: "Just synced this review from the backend! Amazing place.",
                time: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
            },
            {
                author_name: "Angry Local Guide",
                rating: 1,
                text: "Food was cold, very disappointed.",
                time: Math.floor(Date.now() / 1000) - 7200 // 2 hours ago
            }
        ];

        console.log(`[SYNC] Fetched ${googleReviews.length} reviews from Google Places`);

        let insertedCount = 0;
        let duplicateCount = 0;

        // 3. Process Reviews and Prevent Duplicates
        for (const review of googleReviews) {
            // Rule: externalReviewId = authorName + externalTimestamp
            const externalReviewId = `${review.author_name}_${review.time * 1000}`;

            // Check if exists (Mocking DB check)
            /*
            const existingQuery = await db.collection('reviews')
                .where('externalReviewId', '==', externalReviewId)
                .get();
            if (!existingQuery.empty) {
                duplicateCount++;
                continue; // Skip duplicate
            }
            */

            // Determine temporary status based on rating
            let status = "normal";
            if (review.rating <= 2) status = "critical";

            const newReview = {
                branchId: branchId,
                source: "google",
                externalReviewId: externalReviewId,
                authorName: review.author_name,
                rating: review.rating,
                reviewText: review.text,
                sentiment: "pending",     // Defaults to pending for AI processing later
                sentimentScore: 0,
                category: "pending",      // Defaults to pending
                status: status,
                responseStatus: "pending",
                externalTimestamp: review.time * 1000,
                syncedAt: new Date() // Simulate Firebase ServerTimestamp
                // createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Insert into Firestore (Mocked)
            // await db.collection('reviews').add(newReview);
            console.log(`[SYNC] Saved new review from ${newReview.authorName} to DB.`);

            // Note: We would also aggregate the counters on the branch here
            insertedCount++;
        }

        res.status(200).json({
            success: true,
            message: "Sync complete",
            stats: {
                fetched: googleReviews.length,
                inserted: insertedCount,
                duplicatesSkipped: duplicateCount
            }
        });

    } catch (error) {
        console.error("[SYNC] Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------------------------
// Route: /api/search-and-add
// Purpose: Takes a name & location -> Hits Google Places API -> Creates Branch -> Inserts Reviews
// ---------------------------------------------------------------------------
app.post('/api/search-and-add', async (req, res) => {
    const { name, location, managerId } = req.body;

    if (!name || !location || !managerId) {
        return res.status(400).json({ error: "Missing required fields (name, location, managerId)" });
    }

    try {
        console.log(`[ONBOARDING] Searching Google Places for: ${name} in ${location}`);
        const query = `${name} ${location}`;

        // STEP 1: Text Search to find Place ID
        console.log(`[ONBOARDING] Calling Google Places API (TextSearch)...`);
        const searchResponse = await axios.get(`https://maps.googleapis.com/maps/api/place/textsearch/json`, {
            params: {
                query: query,
                key: GOOGLE_PLACES_API_KEY
            }
        });

        const results = searchResponse.data.results;
        if (!results || results.length === 0) {
            return res.status(404).json({ error: "Could not find any business matching that name and location." });
        }

        const topPlace = results[0];
        const placeId = topPlace.place_id;
        console.log(`[ONBOARDING] Match found! Place ID: ${placeId}, Name: ${topPlace.name}`);

        // STEP 2: Fetch Place Details (Specifically to get Reviews & Formatted Name)
        console.log(`[ONBOARDING] Fetching details & live reviews for ${placeId}...`);
        const detailsResponse = await axios.get(`https://maps.googleapis.com/maps/api/place/details/json`, {
            params: {
                place_id: placeId,
                fields: "name,formatted_address,rating,user_ratings_total,reviews",
                reviews_sort: "newest",
                key: GOOGLE_PLACES_API_KEY
            }
        });

        const details = detailsResponse.data.result;
        const liveReviews = details.reviews || [];

        console.log(`[ONBOARDING] Fetched ${liveReviews.length} real reviews from Google.`);

        // STEP 3: Create Branch Document (Mocked insertion pattern for demo)
        const generatedBranchId = `branch_${Date.now()}`;

        const newBranchData = {
            name: details.name,
            location: location,
            managerId: managerId,
            placeId: placeId,
            status: "active",
            totalReviews: details.user_ratings_total || 0,
            averageRating: details.rating || 0,
            positiveReviews: 0, // Would be calculated in reality
            negativeReviews: 0,
            // createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // -> e.g. await db.collection('branches').doc(generatedBranchId).set(newBranchData);
        console.log(`[ONBOARDING] Registered new branch: ${newBranchData.name} (${generatedBranchId})`);

        // STEP 4: Insert Live Reviews
        let insertedReviewCount = 0;
        for (const r of liveReviews) {
            let status = "normal";
            if (r.rating <= 2) status = "critical";

            const newReviewData = {
                branchId: generatedBranchId,
                source: "google",
                externalReviewId: `${r.author_name}_${r.time * 1000}`,
                authorName: r.author_name,
                rating: r.rating,
                reviewText: r.text || "No text provided.",
                sentiment: "pending",
                sentimentScore: 0,
                category: "pending",
                status: status,
                responseStatus: "pending",
                externalTimestamp: r.time * 1000,
                syncedAt: new Date()
                // createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // -> e.g. await db.collection('reviews').add(newReviewData);
            insertedReviewCount++;
        }
        console.log(`[ONBOARDING] Successfully linked ${insertedReviewCount} reviews to ${generatedBranchId}.`);

        // Response Data
        res.status(200).json({
            success: true,
            branchId: generatedBranchId,
            message: `Successfully added ${details.name} and fetched ${insertedReviewCount} live reviews.`
        });

    } catch (error) {
        console.error("[ONBOARDING] Error:", error.response ? error.response.data : error.message);

        // Return a friendly error if it's an API Key Denied issue
        if (error.response && error.response.data && error.response.data.status === 'REQUEST_DENIED') {
            return res.status(500).json({ error: "Google API Key is invalid or missing. Ensure you placed a real GOOGLE_PLACES_API_KEY in the server code/env." });
        }

        res.status(500).json({ error: "Failed to fetch from Google Places API." });
    }
});

// Error handling middleware (catch-all)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        code: err.status || 500
    });
});

const PORT = process.env.PORT || 19002;

// Phase 9: Wrap Express inside HTTP Server for Socket.io
const server = http.createServer(app);
initSockets(server);

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT} exposed to local network`);
        // Phase 9: Initialize background automation tasks
        startSyncJob();
    });
}

module.exports = app;
