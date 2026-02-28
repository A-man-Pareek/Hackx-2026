const express = require('express');
const router = express.Router();

const { authenticate } = require('../auth/authMiddleware');
const { authorizeRoles } = require('../auth/roleMiddleware');
const branchController = require('./branchController');

/**
 * @route   GET /branches
 * @desc    Fetch branches (Admin gets all, Managers get their own)
 * @access  Private
 */
router.get(
    '/',
    authenticate,
    branchController.getBranches
);

/**
 * @route   POST /branches
 * @desc    Create a new branch
 * @access  Private (admin only)
 */
router.post(
    '/',
    authenticate,
    authorizeRoles(['admin']),
    branchController.createBranch
);

module.exports = router;
