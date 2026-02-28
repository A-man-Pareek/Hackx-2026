const express = require('express');
const router = express.Router();

const { authenticate } = require('../auth/authMiddleware');
const { authorizeRoles } = require('../auth/roleMiddleware');
const staffController = require('./staffController');

/**
 * @route   GET /staff
 * @desc    Fetch staff (Filtered by branch securely)
 * @access  Private
 */
router.get(
    '/',
    authenticate,
    staffController.getStaff
);

/**
 * @route   POST /staff
 * @desc    Create a new staff member entry
 * @access  Private (admin, branch_manager)
 */
router.post(
    '/',
    authenticate,
    authorizeRoles(['admin', 'branch_manager']),
    staffController.createStaff
);

module.exports = router;
