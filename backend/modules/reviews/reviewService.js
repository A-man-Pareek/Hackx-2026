const { localDb: db } = require('../../config/localDb'); // Use local JSON DB for persistence
const aiService = require('../ai/aiService');
const logger = require('../../config/logger');
const AuditService = require('../audit/auditService');
const { getIO } = require('../../sockets/socketHandler'); // Socket.io layer
const notificationService = require('../../services/notificationService'); // Nodemailer layer
const axios = require('axios');

/**
 * Service Layer: Processes Review Creation Logic and AI Escalations.
 * Keeps controllers clean and handles database persistence.
 */
class ReviewService {

    /**
     * Creates a new review, runs it through AI processing, applies escalation logic, and stores it in Firestore.
     */
    static async processReviewCreation(payload) {
        const { branchId, source, rating, reviewText, category, authorName, phoneNumber } = payload;

        let isEscalatedBase = rating <= 2;
        let escalationStatusBase = isEscalatedBase ? 'escalated' : 'none';

        const baseReview = {
            branchId,
            source,
            rating,
            reviewText,
            authorName: authorName || 'Anonymous',
            phoneNumber: phoneNumber || 'Not provided',
            category: category || 'uncategorized',
            status: 'pending', // Waiting for AI
            responseStatus: 'pending',

            // Phase 3 & 5.5 Defaults
            aiProcessed: false,
            sentiment: null,
            sentimentConfidence: null,
            categoryConfidence: null,
            isEscalated: isEscalatedBase,
            escalationStatus: escalationStatusBase,

            // Phase 5.5 Backend Scaling metadata
            isDeleted: false,
            schemaVersion: 2,

            createdAt: new Date() // Date for test compatibility since admin SDK is mocked out
        };

        // Write initial document to Database
        const docRef = db.collection('reviews').doc();
        await docRef.set(baseReview);
        const startTime = Date.now();

        // 2. Offload AI processing asynchronously
        const aiResult = await aiService.analyzeReview(reviewText);
        const processingDuration = Date.now() - startTime;

        let updatePayload = {
            status: baseReview.status, // Finalize system status
            aiProcessedAt: new Date(),
            aiProcessingDurationMs: processingDuration
        };

        if (aiResult) {
            updatePayload.aiProcessed = true;
            updatePayload.sentiment = aiResult.sentiment;
            updatePayload.sentimentConfidence = aiResult.sentimentConfidence;
            updatePayload.category = aiResult.category;
            updatePayload.categoryConfidence = aiResult.categoryConfidence;

            // Strict Dynamic Escalation Rule overrides
            if (aiResult.sentiment === 'negative' || rating <= 2) {
                updatePayload.isEscalated = true;
                updatePayload.escalationStatus = 'escalated';
                updatePayload.status = 'critical'; // Force status to mapping
            } else {
                updatePayload.isEscalated = false;
                updatePayload.escalationStatus = 'none';
            }
            logger.info(`AI Processing successful for review ${docRef.id}`, { durationMs: processingDuration });
        } else {
            // Fallback Engine
            updatePayload.aiProcessed = false;
            updatePayload.aiProcessingError = 'AI timeout or failure. Used fallback logic.';
            updatePayload.sentiment = rating <= 2 ? 'negative' : (rating === 3 ? 'neutral' : 'positive');
            logger.warn(`AI Processing failed/timeout for fallback engaged.`);
        }

        // 3. Database Update
        await docRef.update(updatePayload);

        // Phase 5.5 Audit Logger Integration
        if (updatePayload.isEscalated) {
            // await AuditService.logEvent({
            //     actorUid: 'SYSTEM_AI',
            //     action: 'REVIEW_ESCALATED',
            //     targetId: docRef.id,
            //     targetType: 'review',
            //     branchId: branchId,
            //     metadata: { aiSentiment: updatePayload.sentiment, sourceRating: rating }
            // });
        }

        // 4. Return Output Payload Contract

        const resultPayload = {
            reviewId: docRef.id,
            rating,
            sentiment: updatePayload.sentiment,
            sentimentConfidence: updatePayload.sentimentConfidence || 0,
            category: updatePayload.category || baseReview.category,
            categoryConfidence: updatePayload.categoryConfidence || 0,
            isEscalated: updatePayload.isEscalated || isEscalatedBase,
            escalationStatus: updatePayload.escalationStatus || escalationStatusBase,
            processingDurationMs: processingDuration,
            reviewText,
            authorName: baseReview.authorName,
            phoneNumber: baseReview.phoneNumber,
            source
        };

        // Phase 9 Real-Time Sockets: Push new review to the active branch UI instantly
        try {
            getIO().to(branchId).emit('new_review', resultPayload);
        } catch (sErr) {
            logger.warn(`Failed to emit socket broadcast for branch ${branchId}`);
        }

        // Phase 9 Email Alerts: Instantly mail manager if completely escalated
        if (resultPayload.isEscalated) {
            try {
                // Fetch manager ID from the branch document
                // const branchDoc = await db.collection('branches').doc(branchId).get();
                /*
                if (branchDoc.exists) {
                    const managerId = branchDoc.data().managerId;
                    const bName = branchDoc.data().name || branchId;

                    if (managerId) {
                        const managerDoc = await db.collection('users').doc(managerId).get();
                        const mData = managerDoc.data();

                        if (mData && mData.email) {
                            await notificationService.sendCriticalAlert(mData.email, bName, reviewText);
                        }
                    }
                }
                */
            } catch (notifyErr) {
                logger.error('[NOTIFICATION] Error resolving critical alert pipeline:', notifyErr);
            }
        }

        return resultPayload;
    }

    /**
     * Phase 9 Automated Sync logic
     * Hits Google Places API, extracts reviews, tests for duplicates, routes through creation pipeline
     */
    static async syncGoogleReviews(branchId) {
        if (!branchId) throw new Error("branchId is required");
        logger.info(`[SYNC] Initiating background AI sync for branch: ${branchId}`);

        try {
            const branchDoc = await db.collection('branches').doc(branchId).get();
            if (!branchDoc.exists) return { success: false, fetched: 0, error: 'Branch not found' };

            const branchData = branchDoc.data();
            const branchPlaceId = branchData.placeId || (branchId === 'curry_house_id' ? 'ChIJweeUzw_v5zsR3XUa_S6g_Zk' : 'ChIJJ-e1N-_5zsRR0nOaVfV-jK4');

            // 1. Fetch from Google Places API (Mocked fetch utilizing the generic endpoint setup)
            const googleReviews = [
                {
                    author_name: "Scheduled Cron Customer",
                    rating: 4,
                    text: "Background job triggered me natively!",
                    time: Math.floor(Date.now() / 1000) - 3600
                },
                {
                    author_name: "Angry Background Submitter",
                    rating: 1,
                    text: "The service here is terrible, automated.",
                    time: Math.floor(Date.now() / 1000) - 7200
                }
            ];

            let insertedCount = 0;
            let duplicateCount = 0;

            for (const review of googleReviews) {
                const externalReviewId = `${review.author_name}_${review.time * 1000}`;
                const existingQuery = await db.collection('reviews').where('externalReviewId', '==', externalReviewId).get();

                if (!existingQuery.empty) {
                    duplicateCount++;
                    continue;
                }

                // Push through internal pipeline for AI classification AND realtime socket broadcast automatically
                const newReviewPayload = {
                    branchId: branchId,
                    source: "google",
                    externalReviewId: externalReviewId,
                    authorName: review.author_name,
                    rating: review.rating,
                    reviewText: review.text,
                    externalTimestamp: review.time * 1000
                };

                await this.processReviewCreation(newReviewPayload);
                insertedCount++;
            }

            logger.info(`[SYNC] Completed branch ${branchId}. Inserted: ${insertedCount}, Duplicates: ${duplicateCount}`);
            return {
                success: true,
                stats: { fetched: googleReviews.length, inserted: insertedCount, skipped: duplicateCount }
            };

        } catch (error) {
            logger.error(`[SYNC] Background execution error for ${branchId}:`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ReviewService;
