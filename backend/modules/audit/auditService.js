const { db } = require('../../config/firebase');
const logger = require('../../config/logger');

class AuditService {
    /**
     * Emits a standardized audit log for critical system events.
     * @param {Object} params
     * @param {string} params.actorUid User triggering the event
     * @param {string} params.action Description event string (e.g. REVIEW_ESCALATED)
     * @param {string} params.targetId The ID of the affected document/resource
     * @param {string} params.targetType The type of the affected document (e.g. review, user)
     * @param {string} [params.branchId] Optional branch context
     * @param {Object} [params.metadata] Optional JSON diff or additional data
     */
    static async logEvent({ actorUid, action, targetId, targetType, branchId = null, metadata = {} }) {
        try {
            const auditRef = db.collection('auditLogs').doc();

            const payload = {
                actorUid,
                action,
                targetId,
                targetType,
                branchId,
                metadata,
                timestamp: new Date().toISOString()
            };

            await auditRef.set(payload);
            logger.info(`[AUDIT] Action: ${action} | Actor: ${actorUid} | Target: ${targetType}:${targetId}`);

        } catch (error) {
            logger.error(`[AUDIT_FAILURE] Failed to write audit log for action: ${action}`, error);
            // We consciously do not throw errors here to avoid breaking application flows if audit DB hangs
        }
    }
}

module.exports = AuditService;
