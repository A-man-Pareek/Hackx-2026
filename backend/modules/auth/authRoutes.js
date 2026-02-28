const express = require('express');
const router = express.Router();

const { authenticate, authorizeRoles } = require('./authMiddleware');
const authController = require('./authController');

/**
 * @route   POST /auth/register
 * @desc    Create user metadata in Firestore after Firebase account creation
 * @access  Private (admin)
 */
router.post(
    '/register',
    authController.register
);

/**
 * @route   GET /auth/me
 * @desc    Return authenticated user metadata
 * @access  Private (Any authenticated active user)
 */
router.get(
    '/me',
    authenticate,
    authController.getMe
);

/**
 * @route   PATCH /auth/deactivate/:uid
 * @desc    Deactivate a user (soft delete)
 * @access  Private (admin)
 */
router.patch(
    '/deactivate/:uid',
    authenticate,
    authorizeRoles('admin'),
    authController.deactivate
);
/**
 * @route   GET /auth/firebase-config
 * @desc    Return Firebase Config for Frontend
 * @access  Public
 */
router.get(
    '/firebase-config',
    authController.getFirebaseConfig
);

module.exports = router;
