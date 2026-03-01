const { db } = require('../../config/firebase');
const aiService = require('./aiService');

const suggestReply = async (req, res) => {
    try {
        const { reviewId } = req.body;
        const { role, branchId } = req.user;

        if (!reviewId) {
            return res.status(400).json({ success: false, error: 'reviewId is required' });
        }

        const reviewRef = db.collection('reviews').doc(reviewId);
        const reviewDoc = await reviewRef.get();

        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, error: 'Review not found' });
        }

        const reviewData = reviewDoc.data();

        // Admin can access any. Other roles must match branchId
        if (role !== 'admin' && reviewData.branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Access denied to this review' });
        }

        const suggestedText = await aiService.suggestReply(reviewData.reviewText, reviewData.rating);

        if (!suggestedText) {
            return res.status(500).json({ success: false, error: 'Failed to generate AI reply' });
        }

        return res.status(200).json({ success: true, data: { suggestion: suggestedText } });

    } catch (error) {
        console.error('suggestReply Controller Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

const generateMonthlyOverview = async (req, res) => {
    try {
        const { positiveReviews, negativeReviews } = req.body;

        if (!Array.isArray(positiveReviews) || !Array.isArray(negativeReviews)) {
            return res.status(400).json({ success: false, error: 'Positive and negative reviews must be arrays' });
        }

        const overviewData = await aiService.generateMonthlyOverview(positiveReviews, negativeReviews);

        if (!overviewData) {
            return res.status(500).json({ success: false, error: 'Failed to generate AI monthly overview' });
        }

        return res.status(200).json({ success: true, data: overviewData });

    } catch (error) {
        console.error('generateMonthlyOverview Controller Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

module.exports = {
    suggestReply,
    generateMonthlyOverview
};
