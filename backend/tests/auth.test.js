const request = require('supertest');

// MOCK: Firebase config
jest.mock('../config/firebase', () => {
    const mockDbCollectionDocGet = jest.fn();
    const mockDbCollectionDocSet = jest.fn();
    const mockDbCollectionDocUpdate = jest.fn();

    const mockDbCollectionDoc = jest.fn(() => ({
        get: mockDbCollectionDocGet,
        set: mockDbCollectionDocSet,
        update: mockDbCollectionDocUpdate
    }));

    const mockDbCollection = jest.fn(() => ({
        doc: mockDbCollectionDoc
    }));

    const mockAuthVerifyIdToken = jest.fn();

    return {
        admin: {
            auth: () => ({ verifyIdToken: mockAuthVerifyIdToken })
        },
        db: {
            collection: mockDbCollection
        },
        _mockFns: { mockAuthVerifyIdToken, mockDbCollectionDocGet, mockDbCollectionDocSet, mockDbCollectionDocUpdate }
    };
});

const app = require('../server');
const { _mockFns } = require('../config/firebase');

describe('Auth Endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Middleware & getMe', () => {
        it('should return 401 if missing auth header', async () => {
            const res = await request(app).get('/auth/me');
            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('should return 403 if user not in firestore', async () => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValueOnce({ uid: 'test-uid' });
            _mockFns.mockDbCollectionDocGet.mockResolvedValueOnce({ exists: false });

            const res = await request(app)
                .get('/auth/me')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        it('should return 403 if user inactive', async () => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValueOnce({ uid: 'test-uid' });
            _mockFns.mockDbCollectionDocGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ isActive: false })
            });

            const res = await request(app)
                .get('/auth/me')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(403);
        });

        it('should return 200 and user data if valid', async () => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValueOnce({ uid: 'test-uid' });
            _mockFns.mockDbCollectionDocGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    role: 'staff',
                    branchId: 'b1',
                    email: 'test@test.com',
                    name: 'Test',
                    isActive: true
                })
            });

            const res = await request(app)
                .get('/auth/me')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body.uid).toBe('test-uid');
            expect(res.body.role).toBe('staff');
        });
    });

    describe('POST /register', () => {
        const setupMockCaller = (role, branchId = null) => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValueOnce({ uid: 'caller-uid' });
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    role,
                    branchId,
                    email: 'caller@test.com',
                    name: 'Caller',
                    isActive: true
                })
            }));
        };

        it('should reject non-admin caller', async () => {
            setupMockCaller('branch_manager', 'b1');

            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer caller-token')
                .send({
                    uid: 'new-uid',
                    name: 'New',
                    email: 'new@test.com',
                    role: 'staff',
                    branchId: 'b1'
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Insufficient permissions');
        });

        it('should allow admin creating admin', async () => {
            setupMockCaller('admin'); // First get is for middleware

            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: false
            }));

            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer caller-token')
                .send({
                    uid: 'new-uid',
                    name: 'New',
                    email: 'new@test.com',
                    role: 'admin' // In new schema, admin can create anyone
                });

            expect(res.status).toBe(201);
        });

        it('should allow admin creating staff', async () => {
            setupMockCaller('admin');
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: false // Target user doc doesn't exist
            }));

            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer caller-token')
                .send({
                    uid: 'new-uid',
                    name: 'New',
                    email: 'new@test.com',
                    role: 'staff',
                    branchId: 'b1'
                });

            expect(res.status).toBe(201);
            expect(_mockFns.mockDbCollectionDocSet).toHaveBeenCalled();
        });

        it('should reject missing branchId for staff', async () => {
            setupMockCaller('admin');

            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer caller-token')
                .send({
                    uid: 'new-uid',
                    name: 'New',
                    email: 'new@test.com',
                    role: 'staff' // missing branchId
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('branchId is required');
        });

        it('should validate email format', async () => {
            setupMockCaller('admin');
            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer caller-token')
                .send({
                    uid: 'new-uid',
                    name: 'New',
                    email: 'InvalidEmailFormat',
                    role: 'staff',
                    branchId: 'b1'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Invalid email format');
        });
    });

    describe('PATCH /deactivate/:uid', () => {
        const setupMockCaller = (role) => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValueOnce({ uid: 'caller-uid' });
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    role,
                    email: 'caller@test.com',
                    name: 'Caller',
                    isActive: true
                })
            }));
        };

        it('should reject branch_manager deactivating admin', async () => {
            setupMockCaller('branch_manager');
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    role: 'admin',
                    isActive: true
                })
            }));

            const res = await request(app)
                .patch('/auth/deactivate/super-uid')
                .set('Authorization', 'Bearer caller-token');

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Insufficient permissions');
        });

        it('should allow admin deactivating staff', async () => {
            setupMockCaller('admin');
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    role: 'staff',
                    isActive: true
                })
            }));

            const res = await request(app)
                .patch('/auth/deactivate/staff-uid')
                .set('Authorization', 'Bearer caller-token');

            expect(res.status).toBe(200);
            expect(_mockFns.mockDbCollectionDocUpdate).toHaveBeenCalledWith({ isActive: false });
        });
    });
});
