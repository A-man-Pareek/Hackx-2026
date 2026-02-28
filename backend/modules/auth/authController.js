const { db, adminAuth } = require('../../config/firebase');
const VALID_ROLES = require('../../config/roles');
const AuditService = require('../audit/auditService');

/**
 * Register a new user in Firestore after Firebase Auth Client creation.
 * Expects a Firebase ID Token in the Authorization header.
 * Publicly accessible but requires valid Firebase JWT.
 */
const register = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Missing token', code: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(idToken);
        } catch (authErr) {
            console.error('Firebase Admin ID Token Verification Error:', authErr);
            return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token', code: 401 });
        }

        const uid = decodedToken.uid;
        const email = decodedToken.email || req.body.email; // Fallback for some providers

        const { name, role, branchId } = req.body;

        if (!name || !role) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: Missing required fields (name, role)',
                code: 400
            });
        }

        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                error: `Bad Request: Invalid role. Must be one of ${VALID_ROLES.join(', ')}`,
                code: 400
            });
        }

        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            return res.status(409).json({
                success: false,
                error: 'Conflict: User already exists in database',
                code: 409
            });
        }

        const newUser = {
            name,
            email,
            role,
            branchId: role === 'restaurant_owner' ? (branchId || null) : null,
            isActive: true,
            createdAt: new Date().toISOString()
        };

        await userRef.set(newUser);

        await AuditService.logEvent({
            actorUid: uid,
            action: 'USER_REGISTERED',
            targetId: uid,
            targetType: 'user',
            branchId: newUser.branchId,
            metadata: { assignedRole: role, email: email, name: name }
        });

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                uid: uid,
                ...newUser
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            code: 500
        });
    }
};
/**
 * Return authenticated user metadata.
 */
const getMe = async (req, res) => {
    try {
        // req.user is populated by the authenticate authMiddleware
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                code: 401
            });
        }

        // Return user info exactly as required
        return res.status(200).json({
            uid: req.user.uid,
            name: req.user.name,       // NOTE: authenticate currently only attaches { uid, role, branchId, email }
            email: req.user.email,
            role: req.user.role,
            branchId: req.user.branchId
        });
    } catch (error) {
        console.error('GetMe Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            code: 500
        });
    }
};

/**
 * Deactivate a user (soft delete).
 */
const deactivate = async (req, res) => {
    try {
        const targetUid = req.params.uid;
        const currentUserRole = req.user.role;

        if (!targetUid) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: target uid parameter is required',
                code: 400
            });
        }

        const targetUserRef = db.collection('users').doc(targetUid);
        const targetUserDoc = await targetUserRef.get();

        if (!targetUserDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Not Found: Target user does not exist',
                code: 404
            });
        }

        const targetUserData = targetUserDoc.data();

        // Cannot deactivate admin unless current user is admin
        if (targetUserData.role === 'admin' && currentUserRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Cannot deactivate an admin',
                code: 403
            });
        }

        await adminAuth.updateUser(targetUid, { disabled: true });

        await targetUserRef.update({
            isActive: false
        });

        // Phase 5.5: Audit Logger integration
        await AuditService.logEvent({
            actorUid: req.user.uid,
            action: 'USER_DEACTIVATED',
            targetId: targetUid,
            targetType: 'user',
            branchId: req.user.branchId
        });

        return res.status(200).json({
            success: true,
            message: `User ${targetUid} successfully deactivated.`
        });

    } catch (error) {
        console.error('Deactivate Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            code: 500
        });
    }
};

module.exports = {
    deactivate
};

/**
 * Return Firebase Config for Frontend
 */
const getFirebaseConfig = (req, res) => {
    res.status(200).json({
        success: true,
        config: {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: "hackx26.firebaseapp.com",
            projectId: "hackx26"
        }
    });
};

module.exports = {
    register,
    getMe,
    deactivate,
    getFirebaseConfig
};
