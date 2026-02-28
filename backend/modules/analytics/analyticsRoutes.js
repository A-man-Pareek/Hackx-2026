const express = require('express');
const router = express.Router();
const analyticsController = require('./analyticsController');
const { authenticate, authorizeRoles } = require('../auth/authMiddleware');

// Force protection on entire analytics router
router.use(authenticate);
// Broadly restrict analytics to managers and admins at the route level
router.use(authorizeRoles('admin', 'branch_manager'));

/**
 * @route   GET /analytics/branch/:branchId
 * @desc    Get main KPI tiles for a specific branch
 * @access  Private (Branch Manager, Admin)
 */
router.get('/branch/:branchId', analyticsController.getBranchAnalytics);

/**
 * @route   GET /analytics/staff/:staffId
 * @desc    Get performance profile for a specific staff member
 * @access  Private (Branch Manager, Admin)
 */
router.get('/staff/:staffId', analyticsController.getStaffAnalytics);

/**
 * @route   GET /analytics/trends/:branchId
 * @desc    Get time-series analysis for charting
 * @access  Private (Branch Manager, Admin)
 */
router.get('/trends/:branchId', analyticsController.getTrendsAnalytics);

/**
 * @route   GET /analytics/sla/:branchId
 * @desc    Get response-time KPI and SLA breach statistics
 * @access  Private (Branch Manager, Admin)
 */
router.get('/sla/:branchId', analyticsController.getSlaAnalytics);

module.exports = router;
