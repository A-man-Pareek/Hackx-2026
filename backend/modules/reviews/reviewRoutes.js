const express = require('express');
const router = express.Router();

const { authenticate } = require('../auth/authMiddleware');
// Depending on architecture, review creation might be public (from external site) or private.
// For now, protecting to adhere to general backend rules.
const reviewController = require('./reviewController');

// Validation Layer Hook
const validateRequest = require('../../middleware/validateRequest');
const { createReviewSchema, updateCategorySchema } = require('./reviewSchemas');

/**
 * @route   GET /reviews
 * @desc    Fetch reviews safely isolated by branch
 * @access  Private
 */
router.get(
    '/',
    authenticate,
    reviewController.getReviews
);

/**
 * @route   POST /reviews
 * @desc    Submit a new review
 * @access  Private 
 */
router.post(
    '/',
    authenticate,
    validateRequest(createReviewSchema), // Phase 5.5: Validate Payload Structurally
    reviewController.createReview
);

/**
 * @route   PATCH /reviews/:id/category
 * @desc    Override AI categorization manually
 * @access  Private (Branch Manager/Admin check inside controller)
 */
router.patch(
    '/:id/category',
    authenticate,
    validateRequest(updateCategorySchema),
    reviewController.updateCategory
);

module.exports = router;
