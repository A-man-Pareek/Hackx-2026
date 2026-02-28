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
    const mockAuthCreateUser = jest.fn();
    const mockAuthUpdateUser = jest.fn();

    return {
        admin: {
            auth: () => ({
                verifyIdToken: mockAuthVerifyIdToken
            })
        },
        adminAuth: {
            verifyIdToken: mockAuthVerifyIdToken,
            createUser: mockAuthCreateUser,
            updateUser: mockAuthUpdateUser
        },
        db: {
            collection: mockDbCollection
        },
        _mockFns: { mockAuthVerifyIdToken, mockAuthCreateUser, mockAuthUpdateUser, mockDbCollectionDocGet, mockDbCollectionDocSet, mockDbCollectionDocUpdate }
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
        beforeEach(() => {
            _mockFns.mockAuthVerifyIdToken.mockResolvedValue({ uid: 'new-uid', email: 'new@test.com' });
            _mockFns.mockDbCollectionDocGet.mockResolvedValue({ exists: false });
        });

        it('should reject missing token', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({ name: 'New', role: 'customer' });

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Unauthorized: Missing token');
        });

        it('should allow registering a customer', async () => {
            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer valid-token')
                .send({ name: 'New Customer', role: 'customer' });

            expect(res.status).toBe(201);
            expect(_mockFns.mockDbCollectionDocSet).toHaveBeenCalled();
        });

        it('should allow registering a restaurant_owner', async () => {
            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer valid-token')
                .send({ name: 'New Owner', role: 'restaurant_owner', branchId: 'b1' });

            expect(res.status).toBe(201);
            expect(_mockFns.mockDbCollectionDocSet).toHaveBeenCalled();
        });

        it('should allow valid new roles like admin', async () => {
            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer valid-token')
                .send({ name: 'Hacker', role: 'admin' });

            // Admin is now a VALID_ROLE in config/roles.js so this should pass Registration
            expect(res.status).toBe(201);
        });

        it('should reject if user already registered', async () => {
            _mockFns.mockDbCollectionDocGet.mockResolvedValueOnce({ exists: true });
            const res = await request(app)
                .post('/auth/register')
                .set('Authorization', 'Bearer valid-token')
                .send({ name: 'Existing', role: 'customer' });

            expect(res.status).toBe(409);
            expect(res.body.error).toContain('User already exists in database');
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

        it('should reject non-admin caller', async () => {
            setupMockCaller('restaurant_owner');

            const res = await request(app)
                .patch('/auth/deactivate/super-uid')
                .set('Authorization', 'Bearer caller-token');

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Forbidden: Requires one of roles: admin');
        });

        it('should allow admin deactivating user (legacy support)', async () => {
            setupMockCaller('admin');
            _mockFns.mockDbCollectionDocGet.mockImplementationOnce(() => Promise.resolve({
                exists: true,
                data: () => ({
                    role: 'customer',
                    isActive: true
                })
            }));

            const res = await request(app)
                .patch('/auth/deactivate/target-uid')
                .set('Authorization', 'Bearer caller-token');

            expect(res.status).toBe(200);
            expect(_mockFns.mockAuthUpdateUser).toHaveBeenCalledWith('target-uid', { disabled: true });
            expect(_mockFns.mockDbCollectionDocUpdate).toHaveBeenCalledWith({ isActive: false });
        });
    });
});
