const AnalyticsService = require('./analyticsService');

/**
 * GET /analytics/branch/:branchId
 * Scope: Managers and Admins access only
 */
const getBranchAnalytics = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { startDate, endDate } = req.query;

        // Role restriction check
        if (req.user.role !== 'admin' && req.user.branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied to other branch analytics', code: 403 });
        }

        const metrics = await AnalyticsService.getBranchMetrics(branchId, startDate, endDate);

        return res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('getBranchAnalytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * GET /analytics/staff/:staffId
 */
const getStaffAnalytics = async (req, res) => {
    try {
        const { staffId } = req.params;
        // In reality you'd cross-check if the staff belongs to the manager's branch.
        const metrics = await AnalyticsService.getStaffMetrics(staffId);

        return res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('getStaffAnalytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * GET /analytics/trends/:branchId
 */
const getTrendsAnalytics = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { days = 30 } = req.query;

        // Role restriction check
        if (req.user.role !== 'admin' && req.user.branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied to other branch analytics', code: 403 });
        }

        const cappedDays = Math.min(Number(days), 365); // Hard cap trend requests to 1 year per Phase 5.5 Spec

        const metrics = await AnalyticsService.getTimeSeriesTrends(branchId, cappedDays);

        return res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('getTrendsAnalytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * GET /analytics/sla/:branchId
 */
const getSlaAnalytics = async (req, res) => {
    try {
        const { branchId } = req.params;

        // Role restriction check
        if (req.user.role !== 'admin' && req.user.branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied to other branch analytics', code: 403 });
        }

        const metrics = await AnalyticsService.getSlaMetrics(branchId);

        return res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        console.error('getSlaAnalytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

module.exports = {
    getBranchAnalytics,
    getStaffAnalytics,
    getTrendsAnalytics,
    getSlaAnalytics
};
