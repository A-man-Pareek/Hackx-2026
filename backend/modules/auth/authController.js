const { db } = require('../../config/firebase');

const VALID_ROLES = ['admin', 'branch_manager', 'staff'];

/**
 * Validates role escalation:
 * - admin can create branch_manager and staff
 * - branch_manager cannot create users
 */
const canCreateRole = (currentUserRole, targetRole) => {
    if (currentUserRole === 'admin') {
        return ['admin', 'branch_manager', 'staff'].includes(targetRole);
    }
    return false;
};

/**
 * Create user metadata in Firestore after Firebase account creation.
 */
const register = async (req, res) => {
    try {
        const { uid, name, email, role, branchId } = req.body;
        const creatorRole = req.user.role; // Attached by authMiddleware

        // Basic Validation
        if (!uid || !name || !email || !role) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: Missing required fields (uid, name, email, role)',
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

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: Invalid email format',
                code: 400
            });
        }

        // Branch ID validations based on role
        if ((role === 'branch_manager' || role === 'staff') && !branchId) {
            return res.status(400).json({
                success: false,
                error: `Bad Request: branchId is required for role ${role}`,
                code: 400
            });
        }

        if (role === 'admin' && branchId) {
            return res.status(400).json({
                success: false,
                error: `Bad Request: branchId must be null for admin`,
                code: 400
            });
        }

        // Role Escalation Validation
        if (!canCreateRole(creatorRole, role)) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: User with role ${creatorRole} cannot create user with role ${role}`,
                code: 403
            });
        }

        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: User already exists in Firestore',
                code: 400
            });
        }

        const newUserData = {
            name,
            email,
            role,
            branchId: role === 'admin' ? null : (branchId || null),
            isActive: true, // Defaults to true
            createdAt: new Date().toISOString() // Or admin.firestore.FieldValue.serverTimestamp()
        };

        await userRef.set(newUserData);

        return res.status(201).json({
            success: true,
            message: 'User registered successfully'
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

        await targetUserRef.update({
            isActive: false
        });

        return res.status(200).json({
            success: true,
            message: 'User deactivated'
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
    register,
    getMe,
    deactivate
};
