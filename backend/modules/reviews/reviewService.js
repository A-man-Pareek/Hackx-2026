const { db } = require('../../config/firebase'); // Must import from our config for Jest to mock it!
const aiService = require('../ai/aiService');
const logger = require('../../config/logger');
const AuditService = require('../audit/auditService');

/**
 * Service Layer: Processes Review Creation Logic and AI Escalations.
 * Keeps controllers clean and handles database persistence.
 */
class ReviewService {

    /**
     * Creates a new review, runs it through AI processing, applies escalation logic, and stores it in Firestore.
     */
    static async processReviewCreation(payload) {
        const { branchId, source, rating, reviewText, category } = payload;

        // 1. Initial Document Shell
        const docRef = db.collection('reviews').doc();
        const initialStatus = rating <= 2 ? 'critical' : 'normal';
        let isEscalatedBase = rating <= 2;
        let escalationStatusBase = isEscalatedBase ? 'escalated' : 'none';

        const baseReview = {
            branchId,
            source,
            rating,
            reviewText,
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
        await docRef.set(baseReview);
        const startTime = Date.now();

        // 2. Offload AI processing asynchronously
        const aiResult = await aiService.analyzeReview(reviewText);
        const processingDuration = Date.now() - startTime;

        let updatePayload = {
            status: initialStatus, // Finalize system status
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
            logger.warn(`AI Processing failed/timeout for review ${docRef.id}. Fallback engaged.`);
        }

        // 3. Database Update
        await docRef.update(updatePayload);

        // Phase 5.5 Audit Logger Integration
        if (updatePayload.isEscalated) {
            await AuditService.logEvent({
                actorUid: 'SYSTEM_AI',
                action: 'REVIEW_ESCALATED',
                targetId: docRef.id,
                targetType: 'review',
                branchId: branchId,
                metadata: { aiSentiment: updatePayload.sentiment, sourceRating: rating }
            });
        }

        // 4. Return Output Payload Contract
        return {
            reviewId: docRef.id,
            rating,
            sentiment: updatePayload.sentiment,
            sentimentConfidence: updatePayload.sentimentConfidence || 0,
            category: updatePayload.category || baseReview.category,
            categoryConfidence: updatePayload.categoryConfidence || 0,
            isEscalated: updatePayload.isEscalated || isEscalatedBase,
            escalationStatus: updatePayload.escalationStatus || escalationStatusBase,
            processingDurationMs: processingDuration
        };
    }
}

module.exports = ReviewService;
