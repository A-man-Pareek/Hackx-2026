const AnalyticsService = require('../modules/analytics/analyticsService');
const { db } = require('../config/firebase');

// Mock out the database queries
jest.mock('../config/firebase', () => {
    const mockGet = jest.fn();
    return {
        db: {
            collection: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            get: mockGet
        }
    };
});

describe('AnalyticsService Algorithms (Phase 5 PRD)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getBranchMetrics (Option A SLA compliance)', () => {

        it('should return mathematical zeros gracefully if branch has no reviews', async () => {
            db.get.mockResolvedValueOnce({ empty: true, forEach: jest.fn() });
            const metrics = await AnalyticsService.getBranchMetrics('b-1');

            expect(metrics).toEqual({
                branchId: 'b-1',
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
            });
        });

        it('should correctly sum sentiments, compute CSAT, and deduce SLA numbers from documents', async () => {
            // Mock 3 explicit reviews: 2 positive handled on time, 1 negative escalated
            const thirtyDaysAgoObj = new Date();
            thirtyDaysAgoObj.setDate(thirtyDaysAgoObj.getDate() - 15);

            const mockDocs = [
                {
                    data: () => ({
                        rating: 5, sentiment: 'positive', isEscalated: false,
                        responseStatus: 'responded', responseTimeMinutes: 60,
                        createdAt: thirtyDaysAgoObj // Hit velocity metric
                    })
                },
                {
                    data: () => ({
                        rating: 4, sentiment: 'positive', isEscalated: false,
                        responseStatus: 'responded', responseTimeMinutes: 120, // Sum = 180 min
                        createdAt: thirtyDaysAgoObj // Hit velocity metric
                    })
                },
                {
                    data: () => ({
                        rating: 1, sentiment: 'negative', isEscalated: true, // +1 negative, +1 escalated
                        responseStatus: 'pending', createdAt: thirtyDaysAgoObj
                    })
                }
            ];

            db.get.mockResolvedValueOnce({
                empty: false,
                forEach: (cb) => mockDocs.forEach(cb)
            });

            const metrics = await AnalyticsService.getBranchMetrics('b-X');

            expect(metrics.totalReviews).toBe(3);
            expect(metrics.averageRating).toBe(3.3); // (5+4+1)/3 = 3.3
            expect(metrics.positiveCount).toBe(2);
            expect(metrics.negativeCount).toBe(1);
            expect(metrics.sentimentScore).toBe(0.33); // (2 pos - 1 neg) / 3 = +0.33

            // Phase 5.5 Checks
            expect(metrics.escalationCount).toBe(1);
            expect(metrics.escalationRate).toBe(33.3); // 1/3
            expect(metrics.responseCount).toBe(2);
            expect(metrics.responseRate).toBe(66.7); // 2/3
            expect(metrics.avgResponseTimeMinutes).toBe(90); // (60 + 120) / 2 = 90

            expect(metrics.csatScore).toBe(66.7); // 2 pos / 3 total = 66.7%
            expect(metrics.reviewVelocityPerDay).toBe(0.1); // 3 reviews in window / 30 = 0.1
        });
    });

    describe('getTimeSeriesTrends', () => {

        it('should bucket reviews by UTC Date correctly', async () => {
            // Mock two reviews happening on identical dates, one on distinct
            const dateA = new Date('2026-02-15T10:00:00Z');
            const dateB = new Date('2026-02-16T10:00:00Z');

            const mockDocs = [
                { data: () => ({ rating: 5, sentiment: 'positive', isEscalated: false, createdAt: dateA }) },
                { data: () => ({ rating: 1, sentiment: 'negative', isEscalated: true, createdAt: dateA }) },
                { data: () => ({ rating: 3, sentiment: 'neutral', isEscalated: false, createdAt: dateB }) }
            ];

            db.get.mockResolvedValueOnce({
                empty: false,
                forEach: (cb) => mockDocs.forEach(cb)
            });

            const res = await AnalyticsService.getTimeSeriesTrends('b-Z', 30);

            expect(res.period).toBe('30d');
            expect(res.dailyMetrics.length).toBe(2);

            // Assert Bucket 1 (Feb 15) aggregation
            expect(res.dailyMetrics[0]).toEqual(expect.objectContaining({
                date: '2026-02-15',
                totalReviews: 2,
                avgRating: 3.0, // (5+1)/2
                positive: 1,
                negative: 1,
                escalations: 1
            }));

            // Assert Bucket 2 (Feb 16) aggregation
            expect(res.dailyMetrics[1]).toEqual(expect.objectContaining({
                date: '2026-02-16',
                totalReviews: 1,
                avgRating: 3.0,
                neutral: 1,
                escalations: 0
            }));
        });
    });

    describe('getSlaMetrics', () => {
        it('should output SLAs strictly enforcing the 240 minute threshold', async () => {
            const mockDocs = [
                { data: () => ({ responseTimeMinutes: 60, isEscalated: false }) }, // 1 hr, passing
                { data: () => ({ responseTimeMinutes: 240, isEscalated: false }) }, // 4 hr exact, passing
                { data: () => ({ responseTimeMinutes: 300, isEscalated: true }) }, // 5 hr, FAILING OVERDUE
            ];

            db.get.mockResolvedValueOnce({
                empty: false,
                forEach: (cb) => mockDocs.forEach(cb)
            });

            const res = await AnalyticsService.getSlaMetrics('b-Y');

            expect(res.slaThresholdMinutes).toBe(240);
            expect(res.withinSlaPercent).toBe(66.7); // 2 out of 3 beat the 240min marker
            expect(res.avgResponseTimeMinutes).toBe(200); // (60+240+300)/3
            expect(res.overdueEscalations).toBe(1); // The one document over 240 AND escalated
        });
    });
});
