const nodemailer = require('nodemailer');
const logger = require('../config/logger');

class NotificationService {
    constructor() {
        // Mock configuration for ethereal email or console mode.
        // In real environment, use real SMTP credentials securely stored in .env
        this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: process.env.SMTP_USER || 'sample@ethereal.email',
                pass: process.env.SMTP_PASS || 'password'
            }
        });
    }

    async sendCriticalAlert(managerEmail, branchName, reviewText) {
        if (!managerEmail) {
            logger.warn(`[NOTIFICATION] No email provided for branch ${branchName}`);
            return;
        }

        const mailOptions = {
            from: '"ReviewIQ Alerts" <alerts@reviewiq.com>',
            to: managerEmail,
            subject: `URGENT: New critical review at ${branchName}`,
            text: `URGENT: New 1-Star Critical Review at ${branchName}. \n\nCustomer says: '${reviewText}' \n\nPlease respond immediately to mitigate.`
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`[NOTIFICATION] Critical alert sent for ${branchName}: ${info.messageId}`);
        } catch (error) {
            logger.error(`[NOTIFICATION] Failed to send email alert for ${branchName}:`, error);
            // Fallback for development testing
            console.log(`[EMAIL DISPATCH MOCK]: ${mailOptions.text}`);
        }
    }
}

module.exports = new NotificationService();
