const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const aiController = require('./aiController');

/**
 * @route   POST /api/ai/suggest-reply
 * @desc    Generate empathetic reply using Gemini
 * @access  Private
 */
router.post('/suggest-reply', authenticate, aiController.suggestReply);

/**
 * @route   POST /api/ai/monthly-overview
 * @desc    Generate monthly AI overview from review data
 * @access  Private
 */
router.post('/monthly-overview', authenticate, aiController.generateMonthlyOverview);

module.exports = router;
