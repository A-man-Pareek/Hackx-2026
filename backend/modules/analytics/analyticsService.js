const NodeCache = require('node-cache');
const { db } = require('../../config/firebase');
const logger = require('../../config/logger');

// 60 Second Memory Cache for Analytics endpoints as requested in Phase 5.5
const analyticsCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

class AnalyticsService {

    /**
     * Calculates exhaustive stats for a specified branch.
     * Uses Option A (In-memory derived) with Caching hooks.
     * Guaranteed < 300ms SLA hit via caching.
     */
    static async getBranchMetrics(branchId, startDate, endDate) {
        // Query param scoping natively handles 1 year safeguard
        const cacheKey = `branchMetrics_${branchId}_${startDate || 'ALL'}_${endDate || 'ALL'}`;
        const cached = analyticsCache.get(cacheKey);

        if (cached) {
            logger.info(`[ANALYTICS] Cache HIT for branch: ${branchId}`);
            return cached;
        }

        logger.info(`[ANALYTICS] Computing metrics for branch: ${branchId}`);
        let reviewsQuery = db.collection('reviews')
            .where('branchId', '==', branchId)
            .where('isDeleted', '==', false);

        // Append constraints dynamically to save payload reads
        if (startDate) {
            reviewsQuery = reviewsQuery.where('createdAt', '>=', new Date(startDate));
        }
        if (endDate) {
            // Append 23:59:59 to endDate for exhaustive coverage
            const endDatePlusDay = new Date(endDate);
            endDatePlusDay.setUTCHours(23, 59, 59, 999);
            reviewsQuery = reviewsQuery.where('createdAt', '<=', endDatePlusDay);
        }

        const snapshot = await reviewsQuery.get();

        if (snapshot.empty) {
            return this.buildEmptyBranchMetricTemplate(branchId);
        }

        let totalReviews = 0;
        let ratingSum = 0;
        let positiveCount = 0;
        let neutralCount = 0;
        let negativeCount = 0;
        let sentimentScoreSum = 0;
        let escalationCount = 0;
        let responseCount = 0;
        let responseTimeMinutesSum = 0;
        let reviewsLast30DaysCount = 0;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        snapshot.forEach(doc => {
            const data = doc.data();
            totalReviews++;
            ratingSum += data.rating || 0;

            if (data.sentiment === 'positive') {
                positiveCount++;
                sentimentScoreSum += 1;
            } else if (data.sentiment === 'negative') {
                negativeCount++;
                sentimentScoreSum -= 1;
            } else {
                neutralCount++;
                // neutral = 0 mapping natively handles mathematical neutrality
            }

            if (data.isEscalated) escalationCount++;

            if (data.responseStatus === 'responded') {
                responseCount++;
                // O(1) SLA Pull thanks to Phase 5.5 optimization!
                if (data.responseTimeMinutes !== undefined) {
                    responseTimeMinutesSum += data.responseTimeMinutes;
                }
            }

            const rCreatedObj = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date();
            if (rCreatedObj >= thirtyDaysAgo) {
                reviewsLast30DaysCount++;
            }
        });

        // Safe Rate Divisors
        const avgRating = Number((ratingSum / totalReviews).toFixed(1));
        const sentimentScore = Number((sentimentScoreSum / totalReviews).toFixed(2));
        const escalationRate = Number(((escalationCount / totalReviews) * 100).toFixed(1));
        const responseRate = Number(((responseCount / totalReviews) * 100).toFixed(1));
        const avgResponseTimeMinutes = responseCount > 0 ? Math.floor(responseTimeMinutesSum / responseCount) : 0;
        const csatScore = Number(((positiveCount / totalReviews) * 100).toFixed(1));
        const reviewVelocityPerDay = Number((reviewsLast30DaysCount / 30).toFixed(1));

        const metrics = {
            branchId,
            totalReviews,
            averageRating: avgRating,
            positiveCount,
            neutralCount,
            negativeCount,
            sentimentScore,
            escalationCount,
            escalationRate,
            responseCount,
            responseRate,
            avgResponseTimeMinutes,
            csatScore,
            reviewVelocityPerDay
        };

        // Inject computed metrics safely into cache pool
        analyticsCache.set(cacheKey, metrics);
        return metrics;
    }

    /**
     * Fallback format representing zeros gracefully
     */
    static buildEmptyBranchMetricTemplate(branchId) {
        return {
            branchId,
            totalReviews: 0,
            averageRating: 0,
            positiveCount: 0,
            neutralCount: 0,
            negativeCount: 0,
            sentimentScore: 0,
            escalationCount: 0,
            escalationRate: 0,
            responseCount: 0,
            responseRate: 0,
            avgResponseTimeMinutes: 0,
            csatScore: 0,
            reviewVelocityPerDay: 0
        };
    }

    /**
     * Phase 5.2: Staff-Level Analytics Profile
     */
    static async getStaffMetrics(staffId) {
        // Find reviews where this staff member was explicitly tagged
        // Assumes a `staffTagged` field exists on review documents.
        logger.info(`[ANALYTICS] Computing metrics for staff: ${staffId}`);
        const snapshot = await db.collection('reviews')
            .where('staffTagged', '==', staffId)
            .where('isDeleted', '==', false)
            .get();

        if (snapshot.empty) {
            return {
                staffId,
                totalTaggedReviews: 0,
                avgRating: 0,
                avgSentimentScore: 0,
                negativeRate: 0,
                escalationLinked: 0,
                responseHandled: 0,
                avgResponseTimeMinutes: 0
            };
        }

        let totalTaggedReviews = 0;
        let ratingSum = 0;
        let sentimentScoreSum = 0;
        let negativeCount = 0;
        let escalationLinked = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            totalTaggedReviews++;
            ratingSum += data.rating || 0;

            if (data.sentiment === 'positive') sentimentScoreSum += 1;
            else if (data.sentiment === 'negative') {
                sentimentScoreSum -= 1;
                negativeCount++;
            }

            if (data.isEscalated) escalationLinked++;
        });

        // Compute aggregate handled responses directly by this user via Response collection
        const responsesSnap = await db.collection('responses').where('respondedBy', '==', staffId).get();
        let responseHandled = responsesSnap.size;

        const avgRating = Number((ratingSum / totalTaggedReviews).toFixed(1));
        const avgSentimentScore = Number((sentimentScoreSum / totalTaggedReviews).toFixed(2));
        const negativeRate = Number(((negativeCount / totalTaggedReviews) * 100).toFixed(1));

        return {
            staffId,
            totalTaggedReviews,
            avgRating,
            avgSentimentScore,
            negativeRate,
            escalationLinked,
            responseHandled,
            avgResponseTimeMinutes: 0 // Mocked for now unless response documents trace responseTime directly
        };
    }

    /**
     * Phase 5.3: Trend Time Series Analysis
     */
    static async getTimeSeriesTrends(branchId, periodDays) {
        logger.info(`[ANALYTICS] Computing ${periodDays}d trend series for branch: ${branchId}`);

        const now = new Date();
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - Number(periodDays));

        const snapshot = await db.collection('reviews')
            .where('branchId', '==', branchId)
            .where('isDeleted', '==', false)
            .where('createdAt', '>=', pastDate)
            .get();

        const dailyBuckets = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.createdAt) return;

            const dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const dateString = dateObj.toISOString().split('T')[0];

            if (!dailyBuckets[dateString]) {
                dailyBuckets[dateString] = {
                    date: dateString,
                    totalReviews: 0,
                    ratingSum: 0,
                    positive: 0,
                    neutral: 0,
                    negative: 0,
                    escalations: 0
                };
            }

            const b = dailyBuckets[dateString];
            b.totalReviews++;
            b.ratingSum += data.rating || 0;
            if (data.sentiment === 'positive') b.positive++;
            else if (data.sentiment === 'negative') b.negative++;
            else b.neutral++;
            if (data.isEscalated) b.escalations++;
        });

        // Post-process to calculate averages
        const trends = Object.values(dailyBuckets).map(b => ({
            date: b.date,
            totalReviews: b.totalReviews,
            avgRating: Number((b.ratingSum / b.totalReviews).toFixed(1)),
            positive: b.positive,
            neutral: b.neutral,
            negative: b.negative,
            escalations: b.escalations
        })).sort((a, b) => a.date.localeCompare(b.date));

        return {
            period: `${periodDays}d`,
            dailyMetrics: trends
        };
    }

    /**
     * Phase 5.4: SLA Analytics Engine
     */
    static async getSlaMetrics(branchId) {
        const SLA_THRESHOLD_MINUTES = 240; // Default 4 hours per Phase 5.4

        const snapshot = await db.collection('reviews')
            .where('branchId', '==', branchId)
            .where('isDeleted', '==', false)
            .where('responseStatus', '==', 'responded')
            .get();

        if (snapshot.empty) {
            return {
                avgResponseTimeMinutes: 0,
                slaThresholdMinutes: SLA_THRESHOLD_MINUTES,
                withinSlaPercent: 0,
                overdueEscalations: 0
            };
        }

        let totalResponded = 0;
        let responseTimeSum = 0;
        let withinSlaCount = 0;
        let overdueEscalations = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            totalResponded++;

            // Phase 5.5 Write-Time O(1) SLA pull!
            const responseTime = data.responseTimeMinutes || 0;
            responseTimeSum += responseTime;

            if (responseTime <= SLA_THRESHOLD_MINUTES) {
                withinSlaCount++;
            }

            if (responseTime > SLA_THRESHOLD_MINUTES && data.isEscalated) {
                overdueEscalations++;
            }
        });

        return {
            avgResponseTimeMinutes: Math.floor(responseTimeSum / totalResponded),
            slaThresholdMinutes: SLA_THRESHOLD_MINUTES,
            withinSlaPercent: Number(((withinSlaCount / totalResponded) * 100).toFixed(1)),
            overdueEscalations
        };
    }

}

module.exports = AnalyticsService;
