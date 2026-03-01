const { localDb: db } = require('../../config/localDb');
const QRCode = require('qrcode');

/**
 * Handle fetching branches based on user role.
 */
const getBranches = async (req, res) => {
    try {
        const { role, branchId } = req.user;

        if (role !== 'admin' && branchId) {
            const docRef = await db.collection('branches').doc(branchId).get();
            if (!docRef.exists) {
                return res.status(200).json({ success: true, data: [] });
            }
            return res.status(200).json({
                success: true,
                data: [{ id: docRef.id, ...docRef.data() }]
            });
        }

        // Admin: get all branches
        const snapshot = await db.collection('branches').where('status', '==', 'active').get();
        const branches = [];
        snapshot.forEach(doc => {
            branches.push({ id: doc.id, ...doc.data() });
        });

        return res.status(200).json({ success: true, data: branches });

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

/**
 * PUBLIC endpoint: Register a restaurant branch and get back its QR code.
 * No authentication required - intended for restaurant owners to onboard.
 */
const registerBranch = async (req, res) => {
    try {
        const { name, location } = req.body;

        if (!name || !location) {
            return res.status(400).json({ success: false, error: 'Restaurant name and location are required' });
        }

        const newBranch = {
            name,
            location,
            managerId: 'self_registered',
            status: 'active',
            totalReviews: 0,
            averageRating: 0,
            positiveReviews: 0,
            negativeReviews: 0,
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection('branches').add(newBranch);
        const branchId = docRef.id;

        // Generate the QR deep link
        const encodedName = encodeURIComponent(name);
        const deepLink = `hackxmobile://review?branchId=${branchId}&name=${encodedName}`;
        const qrDataUrl = await QRCode.toDataURL(deepLink, {
            width: 400,
            margin: 2,
            color: { dark: '#8b5cf6', light: '#ffffff' },
            errorCorrectionLevel: 'H'
        });

        return res.status(201).json({
            success: true,
            data: {
                branchId,
                name,
                location,
                deepLink,
                qrCode: qrDataUrl
            }
        });

    } catch (error) {
        console.error('registerBranch Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error', code: 500 });
    }
};

/**
 * PUBLIC endpoint: Fetch all active branches for the selection screen.
 */
const getPublicBranches = async (req, res) => {
    try {
        const branches = await db.collection('branches').where('status', '==', 'active').get();
        const results = [];
        branches.forEach(doc => {
            const data = doc.data();
            results.push({
                id: doc.id,
                name: data.name,
                location: data.location
            });
        });
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error('getPublicBranches Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

module.exports = {
    getBranches,
    createBranch,
    registerBranch,
    getPublicBranches
};

