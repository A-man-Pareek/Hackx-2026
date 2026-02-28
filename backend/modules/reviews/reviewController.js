const { db } = require('../../config/firebase');

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

        // Basic sentiment mapping based on rating for dummy purposes
        let sentiment = 'neutral';
        let sentimentScore = 0.5;
        let status = 'normal';

        if (rating >= 4) {
            sentiment = 'positive';
            sentimentScore = 0.9;
        } else if (rating <= 2) {
            sentiment = 'negative';
            sentimentScore = 0.1;
            status = 'critical';
        }

        const newReview = {
            branchId,
            source,
            rating: Number(rating),
            reviewText,
            sentiment,
            sentimentScore,
            category,
            tags: tags || [],
            staffTagged: staffTagged || null,
            status,
            responseStatus: 'pending',
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('reviews').add(newReview);

        return res.status(201).json({
            success: true,
            data: { id: docRef.id, ...newReview }
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
