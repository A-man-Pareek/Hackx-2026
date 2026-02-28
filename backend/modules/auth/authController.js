const { db, adminAuth } = require('../../config/firebase');
const VALID_ROLES = require('../../config/roles');
const AuditService = require('../audit/auditService');

/**
 * Validates role escalation:
 * - admin can create branch_manager and staff
 * - branch_manager cannot create users
 */
const canCreateRole = (currentUserRole, targetRole) => {
    if (currentUserRole === 'admin') {
        return VALID_ROLES.includes(targetRole);
    }
    // Phase 1 Rules: Branch managers can create staff
    if (currentUserRole === 'branch_manager') {
        return targetRole === 'staff';
    }
    return false;
};

/**
 * Register a new user and assign their role.
 * Only an admin can perform this action.
 */
const register = async (req, res) => {
    try {
        const { name, email, password, role, branchId } = req.body; // Removed uid from req.body, added password
        const creatorRole = req.user.role; // Attached by authMiddleware
        const creatorUid = req.user.uid;

        // Basic Validation
        if (!name || !email || !password || !role) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request: Missing required fields (name, email, password, role)',
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

        // 1. Create user in Firebase Authentication
        const userRecord = await adminAuth.createUser({
            email,
            password,
            displayName: name,
            disabled: false,
        });

        // 2. Store user metadata in Firestore
        const newUser = {
            name,
            email,
            role,
            branchId: role === 'admin' ? null : (branchId || null),
            isActive: true, // Defaults to true
            createdAt: new Date().toISOString() // Or admin.firestore.FieldValue.serverTimestamp()
        };

        const userRef = db.collection('users').doc(userRecord.uid);
        await userRef.set(newUser);

        // 3. Audit Logger integration
        await AuditService.logEvent({
            actorUid: creatorUid,
            action: 'USER_REGISTERED',
            targetId: userRecord.uid,
            targetType: 'user',
            branchId: req.user.branchId,
            metadata: { assignedRole: role, assignedBranchId: branchId || null, email: email, name: name }
        });

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                uid: userRecord.uid,
                ...newUser
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        // If Firebase Auth user creation succeeded but Firestore failed, clean up Auth user
        if (error.code && error.code.startsWith('auth/') && error.code !== 'auth/email-already-exists') {
            // This is a Firebase Auth error, but not an email-already-exists error which is handled by the client
            // If the user was created in Auth but not in Firestore, we should delete the Auth user
            if (error.uid) { // Assuming error object might contain uid if user was partially created
                await adminAuth.deleteUser(error.uid).catch(deleteErr => console.error('Failed to delete partially created Auth user:', deleteErr));
            }
        }
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
    register,
    getMe,
    deactivate
};
