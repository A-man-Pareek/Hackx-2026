const express = require('express');
const router = express.Router();
const { authenticate } = require('../auth/authMiddleware');
const templateController = require('./templateController');

router.post('/', authenticate, templateController.createTemplate);
router.get('/', authenticate, templateController.getTemplates);
router.delete('/:id', authenticate, templateController.deleteTemplate);

module.exports = router;
