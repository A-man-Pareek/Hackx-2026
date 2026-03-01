const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { localDb: db } = require('../../config/localDb');

/**
 * @route   POST /qr/generate
 * @desc    Generate a QR code that deep links to the Review IQ app with branch context
 * @access  Public
 */
router.post('/generate', async (req, res) => {
    try {
        const { branchId, restaurantName } = req.body;

        if (!branchId || !restaurantName) {
            return res.status(400).json({
                success: false,
                error: 'branchId and restaurantName are required'
            });
        }

        // Construct the deep link URL
        const encodedName = encodeURIComponent(restaurantName);
        const deepLink = `hackxmobile://review?branchId=${branchId}&name=${encodedName}`;

        // Generate QR code as base64 PNG data URL
        const qrDataUrl = await QRCode.toDataURL(deepLink, {
            width: 400,
            margin: 2,
            color: {
                dark: '#8b5cf6',  // Purple to match app theme
                light: '#09090b' // Dark background to match app theme
            },
            errorCorrectionLevel: 'H'
        });

        return res.status(200).json({
            success: true,
            data: {
                branchId,
                restaurantName,
                deepLink,
                qrCode: qrDataUrl
            }
        });

    } catch (error) {
        console.error('QR Generation Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to generate QR code' });
    }
});

/**
 * @route   GET /qr/preview/:branchId
 * @desc    Serve a QR code as a raw PNG image (for direct viewing/printing)
 * @access  Public
 */
router.get('/preview/:branchId', async (req, res) => {
    try {
        const { branchId } = req.params;
        const restaurantName = req.query.name || 'Restaurant';

        const encodedName = encodeURIComponent(restaurantName);
        const deepLink = `hackxmobile://review?branchId=${branchId}&name=${encodedName}`;

        // Send as PNG image
        res.setHeader('Content-Type', 'image/png');
        await QRCode.toFileStream(res, deepLink, {
            width: 400,
            margin: 2,
            color: {
                dark: '#8b5cf6',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'H'
        });

    } catch (error) {
        console.error('QR Preview Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to generate QR preview' });
    }
});

module.exports = router;
