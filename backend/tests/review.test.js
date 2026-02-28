const request = require('supertest');
const app = require('../server');

// Mock Firebase config
jest.mock('../config/firebase', () => {
    const mockDbCollectionDocAdd = jest.fn();
    const mockDbCollectionDocGet = jest.fn();
    const mockDbCollectionDocUpdate = jest.fn();

    const mockDbCollectionDoc = jest.fn(() => ({
        get: mockDbCollectionDocGet,
    }));

    const mockDbCollection = jest.fn(() => ({
        add: mockDbCollectionDocAdd,
        where: jest.fn().mockReturnThis(),
        get: mockDbCollectionDocGet,
        doc: mockDbCollectionDoc
    }));

    const mockAuthVerifyIdToken = jest.fn();

    return {
        admin: { auth: () => ({ verifyIdToken: mockAuthVerifyIdToken }) },
        db: { collection: mockDbCollection },
        _mockFns: { mockAuthVerifyIdToken, mockDbCollectionDocAdd, mockDbCollectionDocGet, mockDbCollectionDocUpdate }
    };
});

// Mock AI Service directly preventing real OpenAI calls
jest.mock('../modules/ai/aiService', () => {
    return {
        analyzeReview: jest.fn()
    }
});

const { _mockFns } = require('../config/firebase');
const aiService = require('../modules/ai/aiService');

describe('Reviews Endpoints (Phase 3 AI Integration)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default middleware caller setup (branch_manager)
        _mockFns.mockAuthVerifyIdToken.mockResolvedValue({ uid: 'test-uid' });
        _mockFns.mockDbCollectionDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ role: 'branch_manager', branchId: 'branch-1', isActive: true })
        });

        // Default DB Response for review creation
        _mockFns.mockDbCollectionDocAdd.mockResolvedValue({
            id: 'mock-review-123',
            update: _mockFns.mockDbCollectionDocUpdate
        });
    });

    describe('POST /reviews', () => {
        it('should successfully create review with AI enrichment and correct escalation logic', async () => {
            // Mock AI behavior resolving to positive
            aiService.analyzeReview.mockResolvedValueOnce({
                sentiment: 'positive',
                sentimentConfidence: 0.85,
                category: 'food',
                categoryConfidence: 0.90
            });

            const reqBody = {
                branchId: 'branch-1',
                source: 'web',
                rating: 5,
                reviewText: 'The pizza was absolutely fantastic!',
                category: 'Uncategorized' // Simulating client generic upload
            };

            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send(reqBody);

            expect(res.status).toBe(201);
            expect(aiService.analyzeReview).toHaveBeenCalledWith(reqBody.reviewText);

            // Check Database Call Object (Base creation phase)
            const dbAddArgs = _mockFns.mockDbCollectionDocAdd.mock.calls[0][0];
            expect(dbAddArgs.aiProcessed).toBe(false);
            expect(dbAddArgs.status).toBe('pending');

            // Check Update Object (Enrichment phase)
            const dbUpdateArgs = _mockFns.mockDbCollectionDocUpdate.mock.calls[0][0];
            expect(dbUpdateArgs.aiProcessed).toBe(true);
            expect(dbUpdateArgs.sentiment).toBe('positive');
            expect(dbUpdateArgs.sentimentConfidence).toBe(0.85);
            expect(dbUpdateArgs.category).toBe('food');

            // Should not escalate 5 star positive
            expect(dbUpdateArgs.isEscalated).toBe(false);
            expect(dbUpdateArgs.escalationStatus).toBe('none');

            // Assert exact API payload contract returned
            expect(res.body.data).toEqual({
                reviewId: 'mock-review-123',
                rating: 5,
                sentiment: 'positive',
                sentimentConfidence: 0.85,
                category: 'food',
                categoryConfidence: 0.90,
                isEscalated: false,
                escalationStatus: 'none'
            });
        });

        it('should trigger escalation when AI returns negative sentiment even if rating is high', async () => {
            aiService.analyzeReview.mockResolvedValueOnce({
                sentiment: 'negative',
                sentimentConfidence: 0.99,
                category: 'staff',
                categoryConfidence: 0.70
            });

            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    branchId: 'branch-1', source: 'web', rating: 4, reviewText: 'Horrible waitress but food was great.', category: 'food'
                });

            expect(res.status).toBe(201);
            const dbUpdateArgs = _mockFns.mockDbCollectionDocUpdate.mock.calls[0][0];

            expect(dbUpdateArgs.sentiment).toBe('negative');
            expect(dbUpdateArgs.isEscalated).toBe(true); // AI sentiment overrode integer rating logic securely
            expect(dbUpdateArgs.escalationStatus).toBe('escalated');
        });

        it('should gracefully fallback if AI service fails or times out', async () => {
            // Mock AI throwing error
            aiService.analyzeReview.mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    branchId: 'branch-1', source: 'web', rating: 1, reviewText: 'Never again!', category: 'food' // Hard rating 1
                });

            expect(res.status).toBe(201);

            const dbUpdateArgs = _mockFns.mockDbCollectionDocUpdate.mock.calls[0][0];
            expect(dbUpdateArgs.aiProcessed).toBe(false);
            expect(dbUpdateArgs.aiProcessingError).toContain('fallback logic');

            // Fallback should still utilize rating-based derivation
            expect(dbUpdateArgs.sentiment).toBe('negative'); // Derived from rating <= 2
            expect(dbUpdateArgs.isEscalated).toBe(true); // Derived from rating <= 2 natively
        });

        it('should enforce required fields', async () => {
            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send({}); // Empty body

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing required');
            expect(aiService.analyzeReview).not.toHaveBeenCalled();
        });
    });
});
