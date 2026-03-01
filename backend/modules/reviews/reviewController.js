const { localDb: db } = require('../../config/localDb'); // Use local JSON DB for persistence
const { getAllReviews } = require('../../config/localDb');
const ReviewService = require('./reviewService');

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

        let reviewsRef = db.collection('reviews').where('isDeleted', '==', false); // Phase 5.5 safeguard
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
 * Create a review manually
 */
const createReview = async (req, res) => {
    try {
        // Payload has already been robustly validated by Zod at the Route level!
        const resultPayload = await ReviewService.processReviewCreation(req.body);

        // Respond with exact PRD JSON Contract
        return res.status(201).json({
            success: true,
            data: resultPayload
        });

    } catch (error) {
        console.error('createReview (Service Layer) Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

/**
 * Update a review's category manually
 */
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { category } = req.body;
        const { role, branchId, uid } = req.user;

        const reviewRef = db.collection('reviews').doc(id);
        const reviewDoc = await reviewRef.get();

        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, error: 'Review not found', code: 404 });
        }

        const reviewData = reviewDoc.data();

        if (role !== 'admin' && reviewData.branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Access denied to this branch\'s review', code: 403 });
        }

        await reviewRef.update({
            category,
            manualOverride: true,
            overriddenBy: uid,
            updatedAt: new Date().toISOString()
        });

        return res.status(200).json({ success: true, message: 'Category manually overridden', data: { category } });
    } catch (error) {
        console.error('updateCategory Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

module.exports = {
    getReviews,
    createReview,
    updateCategory
};
