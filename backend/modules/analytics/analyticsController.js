const AnalyticsService = require('./analyticsService');
const { Parser } = require('json2csv');

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

/**
 * GET /analytics/dashboard
 */
const getDashboardAnalytics = async (req, res) => {
    try {
        const { branchId, timeframe } = req.query; // e.g. timeframe="30d"
        const { role, branchId: userBranchId } = req.user;

        const effectiveBranchId = branchId || userBranchId;

        if (role !== 'admin' && effectiveBranchId !== userBranchId) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        let timeframeDays = 30;
        if (timeframe && timeframe.endsWith('d')) {
            timeframeDays = parseInt(timeframe.replace('d', ''), 10);
        }

        const data = await AnalyticsService.getDashboardData(effectiveBranchId, role, timeframeDays);

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('getDashboardAnalytics error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * GET /analytics/insights
 */
const getDeepInsights = async (req, res) => {
    try {
        const { branchId } = req.query;
        const { role, branchId: userBranchId } = req.user;

        const effectiveBranchId = branchId || userBranchId;

        if (role !== 'admin' && effectiveBranchId !== userBranchId) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const summary = await AnalyticsService.generateDeepInsights(effectiveBranchId);

        return res.status(200).json({ success: true, data: { insights: summary } });
    } catch (error) {
        console.error('getDeepInsights error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message, stack: error.stack });
    }
};

/**
 * Phase 9 Export Hook
 * GET /analytics/export?branchId={id}&type=reviews
 */
const exportCsv = async (req, res) => {
    try {
        const { branchId, type } = req.query;
        const { role, branchId: userBranchId } = req.user;

        const effectiveBranchId = branchId || userBranchId;

        if (role !== 'admin' && effectiveBranchId !== userBranchId) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        let dataToExport = [];
        let filename = 'export.csv';

        // 1. Fetch raw payload for CSV compilation
        if (type === 'reviews') {
            const { db } = require('../../config/firebase');
            const snap = await db.collection('reviews')
                .where('branchId', '==', effectiveBranchId)
                .where('isDeleted', '==', false)
                .orderBy('createdAt', 'desc')
                .limit(500) // Hard limit to prevent extreme memory dumps
                .get();

            snap.forEach(doc => {
                const d = doc.data();
                dataToExport.push({
                    ReviewID: doc.id,
                    Source: d.source,
                    Author: d.authorName,
                    StarRating: d.rating,
                    Sentiment: d.sentiment,
                    Category: d.category,
                    IsEscalated: d.isEscalated ? 'Yes' : 'No',
                    ReviewText: d.reviewText ? d.reviewText.substring(0, 150) + '...' : '',
                    Date: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : new Date(d.createdAt).toISOString()) : new Date().toISOString()
                });
            });
            filename = `BranchReviews_${effectiveBranchId}_${Date.now()}.csv`;
        } else {
            return res.status(400).json({ error: 'Unsupported export type' });
        }

        if (dataToExport.length === 0) {
            return res.status(404).json({ error: 'No data to export' });
        }

        // 2. Parse and generate CSV buffer
        const parser = new Parser();
        const csv = parser.parse(dataToExport);

        // 3. Configure native attachment headers
        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        return res.status(200).send(csv);

    } catch (error) {
        console.error('exportCsv error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message, stack: error.stack });
    }
};

module.exports = {
    getBranchAnalytics,
    getStaffAnalytics,
    getTrendsAnalytics,
    getSlaAnalytics,
    getDashboardAnalytics,
    getDeepInsights,
    exportCsv
};
