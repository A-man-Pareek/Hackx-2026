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

module.exports = router;
