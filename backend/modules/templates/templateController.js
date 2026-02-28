const { db } = require('../../config/firebase');
const { v4: uuidv4 } = require('uuid');

const createTemplate = async (req, res) => {
    try {
        const { title, content } = req.body;
        const { branchId, role } = req.user;

        if (!title || !content) {
            return res.status(400).json({ success: false, error: 'Title and content are required' });
        }

        const assignBranchId = role === 'admin' ? (req.body.branchId || branchId) : branchId;

        const newTemplate = {
            id: uuidv4(),
            branchId: assignBranchId,
            title,
            content,
            createdAt: new Date().toISOString()
        };

        await db.collection('templates').doc(newTemplate.id).set(newTemplate);

        res.status(201).json({ success: true, data: newTemplate });
    } catch (error) {
        console.error('createTemplate Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

const getTemplates = async (req, res) => {
    try {
        const { branchId, role } = req.user;
        let queryBranchId = req.query.branchId || branchId;

        if (role !== 'admin') {
            queryBranchId = branchId;
        }

        const snapshot = await db.collection('templates').where('branchId', '==', queryBranchId).get();
        const templates = [];
        snapshot.forEach(doc => templates.push({ id: doc.id, ...doc.data() }));

        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        console.error('getTemplates Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId, role } = req.user;

        const templateRef = db.collection('templates').doc(id);
        const templateDoc = await templateRef.get();

        if (!templateDoc.exists) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }

        if (role !== 'admin' && templateDoc.data().branchId !== branchId) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        await templateRef.delete();

        res.status(200).json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('deleteTemplate Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

module.exports = { createTemplate, getTemplates, deleteTemplate };
