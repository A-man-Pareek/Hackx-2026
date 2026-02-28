const cron = require('node-cron');
const { db } = require('../config/firebase');
const ReviewService = require('../modules/reviews/reviewService');
const logger = require('../config/logger');

// Run every 6 hours
const START_SCHEDULE = '0 */6 * * *';

const startSyncJob = () => {
    logger.info(`[CRON] Scheduled Background Sync Job initialized to run: ${START_SCHEDULE}`);

    cron.schedule(START_SCHEDULE, async () => {
        logger.info('[CRON] Executing scheduled branch synchronization...');

        try {
            // Find all active branches that have a placeId attached
            const branchesSnap = await db.collection('branches')
                .where('status', '==', 'active')
                .get();

            if (branchesSnap.empty) {
                logger.info('[CRON] No active branches found to sync.');
                return;
            }

            const branchesToSync = [];
            branchesSnap.forEach(doc => {
                const data = doc.data();
                if (data.placeId) {
                    branchesToSync.push(doc.id);
                }
            });

            logger.info(`[CRON] Found ${branchesToSync.length} branches to sync.`);

            // Synchronously process to avoid aggressive rate limiting from external APIs
            for (const branchId of branchesToSync) {
                try {
                    // Random backoff jitter between 1s and 3s
                    const jitterMs = Math.floor(Math.random() * 2000) + 1000;
                    await new Promise(resolve => setTimeout(resolve, jitterMs));

                    await ReviewService.syncGoogleReviews(branchId);
                } catch (branchErr) {
                    logger.error(`[CRON] Sync failed for branch ${branchId}:`, branchErr);
                }
            }

            logger.info('[CRON] Scheduled synchronization loop completed successfully.');
        } catch (error) {
            logger.error('[CRON] Primary execution failure:', error);
        }
    });
};

module.exports = { startSyncJob };
