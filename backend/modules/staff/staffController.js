const { db } = require('../../config/firebase');

/**
 * Handle fetching staff.
 * admin: can fetch all staff or filter by query branchId
 * branch_manager / staff: can only fetch staff for their assigned branch
 */
const getStaff = async (req, res) => {
    try {
        const { role, branchId } = req.user;
        let queryBranchId = req.query.branchId;

        // Determine which branch to query
        if (role !== 'admin') {
            if (!branchId) {
                return res.status(403).json({ success: false, error: 'User does not have an assigned branchId', code: 403 });
            }
            // Enforce their own branch
            queryBranchId = branchId;
        }

        let staffRef = db.collection('staff');
        let snapshot;

        if (queryBranchId) {
            snapshot = await staffRef.where('branchId', '==', queryBranchId).get();
        } else {
            // Admin getting all staff across all branches
            snapshot = await staffRef.get();
        }

        const staff = [];
        snapshot.forEach(doc => {
            staff.push({ id: doc.id, ...doc.data() });
        });

        return res.status(200).json({
            success: true,
            data: staff
        });

    } catch (error) {
        console.error('getStaff Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

/**
 * Create a new staff record (Not a Firebase Auth user, just a DB record matching models.ts)
 */
const createStaff = async (req, res) => {
    try {
        const { role: currentUserRole, branchId: userBranchId } = req.user;
        const { name, branchId, role, email } = req.body;

        if (!name || !branchId || !role) {
            return res.status(400).json({ success: false, error: 'Missing name, branchId, or role', code: 400 });
        }

        // Only admin can create staff for ANY branch. Managers can only create for their OWN branch.
        if (currentUserRole !== 'admin' && branchId !== userBranchId) {
            return res.status(403).json({ success: false, error: 'Forbidden: Cannot create staff for another branch', code: 403 });
        }

        const newStaff = {
            name,
            branchId,
            role,
            email: email || null,
            performanceScore: 0,
            totalReviewsTagged: 0,
            averageRating: 0,
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('staff').add(newStaff);

        return res.status(201).json({
            success: true,
            data: { id: docRef.id, ...newStaff }
        });

    } catch (error) {
        console.error('createStaff Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

module.exports = {
    getStaff,
    createStaff
};
