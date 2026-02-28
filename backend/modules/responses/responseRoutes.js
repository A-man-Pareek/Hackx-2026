const express = require('express');
const router = express.Router();

const { authenticate } = require('../auth/authMiddleware');
const responseController = require('./responseController');

/**
 * @route   GET /responses?reviewId=123
 * @desc    Fetch responses for a specific review
 * @access  Private
 */
router.get(
    '/',
    authenticate,
    responseController.getResponses
);

/**
 * @route   POST /responses
 * @desc    Submit a response to a review
 * @access  Private 
 */
router.post(
    '/',
    authenticate,
    responseController.createResponse
);

module.exports = router;
