const { admin, db } = require('../../config/firebase');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Missing or invalid token format',
                code: 401
            });
        }

        const idToken = authHeader.split('Bearer ')[1];

        // Verify the ID token using Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid } = decodedToken;

        // Fetch user data from Firestore
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: User not found in system',
                code: 403
            });
        }

        const userData = userDoc.data();

        if (userData.isActive === false) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: User is inactive',
                code: 403
            });
        }

        // Attach user info to request
        req.user = {
            uid,
            name: userData.name,
            role: userData.role,
            branchId: userData.branchId,
            email: userData.email
        };

        next();

    } catch (error) {
        console.error('Authentication Error:', error);
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid token',
            code: 401
        });
    }
};

/**
 * Middleware factory to authorize specific roles dynamically.
 * Must be used AFTER `authenticate` middleware.
 * @param  {...string} roles Array of allowed roles (e.g. 'admin', 'branch_manager')
 */
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, error: 'Unauthorized: User role not found', code: 401 });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Requires one of roles: ${roles.join(', ')}`,
                code: 403
            });
        }

        next();
    };
};

module.exports = { authenticate, authorizeRoles };
