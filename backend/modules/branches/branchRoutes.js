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

/**
 * @route   POST /branches/register
 * @desc    Public endpoint for restaurants to self-register and get a QR code
 * @access  Public
 */
router.post(
    '/register',
    branchController.registerBranch
);

/**
 * @route   GET /branches/public
 * @desc    Public endpoint to fetch all active branches for selection
 * @access  Public
 */
router.get(
    '/public',
    branchController.getPublicBranches
);

module.exports = router;
