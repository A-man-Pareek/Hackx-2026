const { ZodError } = require('zod');
const logger = require('../config/logger');

/**
 * Express middleware to validate request bodies against a provided Zod schema.
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against.
 */
const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                logger.warn(`Validation Error on ${req.method} ${req.originalUrl}:`, error.errors);
                // Handle zod issues object mapping safely
                const issues = error.errors || error.issues || [];
                const errorMessages = issues.map(err => {
                    const path = err.path ? err.path.join('.') : 'unknown';
                    return `${path}: ${err.message}`;
                });

                return res.status(400).json({
                    success: false,
                    error: "Validation error",
                    details: errorMessages,
                    code: 400
                });
            }
            // Fallback for unexpected non-zod formatting errors
            next(error);
        }
    };
};

module.exports = validateRequest;
