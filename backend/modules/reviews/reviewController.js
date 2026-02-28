const { db } = require('../../config/firebase');
const { analyzeReview } = require('../ai/aiService');

/**
 * Handle fetching reviews.
 * admin: all reviews or filter by query
 * managers/staff: reviews scoped to their assigned branchId
 */
const getReviews = async (req, res) => {
    try {
        const { role, branchId } = req.user;
        let queryBranchId = req.query.branchId;

        // Determine which branch to query
        if (role !== 'admin') {
            if (!branchId) {
                return res.status(403).json({ success: false, error: 'User does not have an assigned branchId', code: 403 });
            }
            // Enforce their own branch
            queryBranchId = branchId;
        }

        let reviewsRef = db.collection('reviews');
        let snapshot;

        if (queryBranchId) {
            snapshot = await reviewsRef.where('branchId', '==', queryBranchId).get();
        } else {
            // Admin getting all reviews
            snapshot = await reviewsRef.get();
        }

        const reviews = [];
        snapshot.forEach(doc => {
            reviews.push({ id: doc.id, ...doc.data() });
        });

        return res.status(200).json({
            success: true,
            data: reviews
        });

    } catch (error) {
        console.error('getReviews Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

/**
 * Create a review manually (in real-world this would be webhooks/crawlers, but needed for CRUD)
 */
const createReview = async (req, res) => {
    try {
        const { branchId, source, rating, reviewText, category, staffTagged, tags } = req.body;

        if (!branchId || !source || !rating || !reviewText || !category) {
            return res.status(400).json({ success: false, error: 'Missing required review fields', code: 400 });
        }

        // Basic sentiment mapping based on rating for FALLBACK
        let sentiment = 'neutral';
        if (rating >= 4) sentiment = 'positive';
        else if (rating <= 2) sentiment = 'negative';

        // PRD Flow Step 2: Create base review document (status: pending)
        const baseReview = {
            branchId,
            source,
            rating: Number(rating),
            reviewText,
            category,
            sentiment,
            sentimentConfidence: null,
            categoryConfidence: null,
            aiProcessed: false,
            aiProcessingError: null,
            isEscalated: false,
            escalationStatus: 'none',
            tags: tags || [],
            staffTagged: staffTagged || null,
            status: 'pending', // Explicit requirement
            responseStatus: 'pending',
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('reviews').add(baseReview);

        // PRD Flow Step 3: Call AI service
        const aiResult = await analyzeReview(reviewText);

        // PRD Flow Step 4 & 5: Receive AI result and Apply Escalation Logic
        let finalSentiment = sentiment;
        let finalCategory = category;
        let sentimentConfidence = null;
        let categoryConfidence = null;
        let aiProcessed = false;
        let aiProcessingError = null;

        if (aiResult) {
            finalSentiment = aiResult.sentiment;
            finalCategory = aiResult.category;
            sentimentConfidence = aiResult.sentimentConfidence;
            categoryConfidence = aiResult.categoryConfidence;
            aiProcessed = true;
        } else {
            aiProcessingError = "AI service failed or timed out. Used fallback logic.";
        }

        let isEscalated = false;
        let escalationStatus = 'none';
        let escalatedAt = null;

        if (finalSentiment === 'negative' || Number(rating) <= 2) {
            isEscalated = true;
            escalationStatus = 'escalated';
            escalatedAt = new Date().toISOString();
        }

        const enrichedUpdate = {
            sentiment: finalSentiment,
            sentimentConfidence,
            category: finalCategory,
            categoryConfidence,
            aiProcessed,
            aiProcessingError,
            isEscalated,
            escalationStatus
        };

        if (isEscalated) {
            enrichedUpdate.escalatedAt = escalatedAt;
        }

        // PRD Flow Step 6: Update review document with AI enrichment
        await docRef.update(enrichedUpdate);

        // PRD Flow Step 7: Respond to client (Exact output contract)
        return res.status(201).json({
            success: true,
            data: {
                reviewId: docRef.id,
                rating: Number(rating),
                sentiment: finalSentiment,
                sentimentConfidence,
                category: finalCategory,
                categoryConfidence,
                isEscalated,
                escalationStatus
            }
        });

    } catch (error) {
        console.error('createReview Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

module.exports = {
    getReviews,
    createReview
};
