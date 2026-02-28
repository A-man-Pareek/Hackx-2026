// roleMiddleware.js

/**
 * Middleware factory to authorize specific roles.
 * @param {string[]} allowedRoles - Array of roles allowed to access the route.
 */
const authorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: No role assigned',
                code: 403
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Insufficient permissions',
                code: 403
            });
        }

        next();
    };
};

/**
 * Middleware to enforce branch-level data isolation.
 * Assumes the route parameter contains the requested branchId (e.g., /branches/:branchId/...)
 * Or it can be checked against a body/query parameter. For this implementation, we will check
 * req.params.branchId first, then req.body.branchId.
 */
const authorizeBranch = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            code: 401
        });
    }

    const { role, branchId: userBranchId } = req.user;

    // admin has access to all branches
    if (role === 'admin') {
        return next();
    }

    // Determine the requested branch ID from params, body, or query
    const requestedBranchId = req.params.branchId || req.body.branchId || req.query.branchId;

    if (!requestedBranchId) {
        // If no specific branch is requested, pass to controller
        return next();
    }

    // branch_manager and staff can only access their assigned branch
    if (userBranchId !== requestedBranchId) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: Cannot access data outside of assigned branch',
            code: 403
        });
    }

    next();
};

module.exports = {
    authorizeRoles,
    authorizeBranch
};
