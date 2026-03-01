const { db } = require('../../config/firebase');

/**
 * Handle fetching branches based on user role.
 * admin: view all
 * branch_manager / staff: view their own branch only
 */
const getBranches = async (req, res) => {
    try {
        const { role, branchId } = req.user;

        let branchesRef = db.collection('branches');
        let snapshot;

        if (role === 'admin') {
            snapshot = await branchesRef.get();
        } else if (role === 'restaurant_owner') {
            snapshot = await branchesRef.where('managerId', '==', req.user.uid).get();
        } else {
            if (!branchId) {
                return res.status(400).json({ success: false, error: 'User does not have an assigned branchId', code: 400 });
            }
            // Just get the single branch document
            const docRef = await branchesRef.doc(branchId).get();
            if (!docRef.exists) {
                return res.status(200).json({ success: true, data: [] });
            }
            return res.status(200).json({
                success: true,
                data: [{ id: docRef.id, ...docRef.data() }]
            });
        }

        const branches = [];
        if (snapshot) {
            snapshot.forEach(doc => {
                branches.push({ id: doc.id, ...doc.data() });
            });
        }

        return res.status(200).json({
            success: true,
            data: branches
        });

    } catch (error) {
        console.error('getBranches Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

/**
 * Handle creating a new branch. Allowed only for admins.
 */
const createBranch = async (req, res) => {
    try {
        const { name, location, managerId } = req.body;

        if (!name || !location || !managerId) {
            return res.status(400).json({ success: false, error: 'Missing name, location, or managerId', code: 400 });
        }

        const newBranch = {
            name,
            location,
            managerId,
            status: 'active',
            totalReviews: 0,
            averageRating: 0,
            positiveReviews: 0,
            negativeReviews: 0,
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('branches').add(newBranch);

        return res.status(201).json({
            success: true,
            data: { id: docRef.id, ...newBranch }
        });

    } catch (error) {
        console.error('createBranch Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

module.exports = {
    getBranches,
    createBranch
};
