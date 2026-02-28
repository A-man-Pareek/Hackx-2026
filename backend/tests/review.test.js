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

        // Mock expected output from Service layer so the Controller acts as an interface test.
        jest.spyOn(require('../modules/reviews/reviewService'), 'processReviewCreation').mockResolvedValue({
            reviewId: 'mock-review-123',
            rating: 5,
            sentiment: 'positive',
            sentimentConfidence: 0.85,
            category: 'food',
            categoryConfidence: 0.90,
            isEscalated: false,
            escalationStatus: 'none',
            processingDurationMs: 42
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /reviews', () => {
        it('should execute review creation via the abstraction and pass validated fields', async () => {
            const reqBody = {
                branchId: "branch-X",
                source: "google",
                rating: 5,
                reviewText: "Amazing food!",
                category: "food"
            };

            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send(reqBody);

            expect(res.status).toBe(201);

            // Check that it reached our generic Service Layer interface seamlessly
            expect(require('../modules/reviews/reviewService').processReviewCreation).toHaveBeenCalledWith(reqBody);

            // Assert PRD output contract match
            expect(res.body.data).toEqual({
                reviewId: 'mock-review-123',
                rating: 5,
                sentiment: 'positive',
                sentimentConfidence: 0.85,
                category: 'food',
                categoryConfidence: 0.90,
                isEscalated: false,
                escalationStatus: 'none',
                processingDurationMs: 42
            });
        });

        it('should enforce strictly typed payloads via Zod middleware returning exactly 400', async () => {
            const reqBody = {
                // branchId missing
                source: "INVALID_SOURCE", // Bad source
                rating: 6, // Exceeds 5
                reviewText: "" // Empty string validation
            };

            const res = await request(app)
                .post('/reviews')
                .set('Authorization', 'Bearer valid-token')
                .send(reqBody);

            expect(res.status).toBe(400); // Handled explicitly by generic Zod middleware!
            expect(res.body.success).toBe(false);
            expect(res.body.details).toContain("branchId: Invalid input: expected string, received undefined");
            expect(res.body.details).toContain("source: Invalid option: expected one of \"internal\"|\"google\"|\"zomato\"|\"swiggy\"");
            expect(res.body.details).toContain("rating: Rating must be at most 5");
            expect(res.body.details).toContain("reviewText: Review text cannot be empty");
        });
    });
});
