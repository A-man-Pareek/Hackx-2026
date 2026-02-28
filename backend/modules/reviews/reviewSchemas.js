const { z } = require('zod');

const SOURCE_ENUM = ['internal', 'google', 'zomato', 'swiggy'];

// Review creation schema rules
const createReviewSchema = z.object({
    branchId: z.string().min(1, "Branch ID is required"),
    source: z.enum(SOURCE_ENUM, {
        errorMap: () => ({ message: "Source must be one of: internal, google, zomato, swiggy" })
    }),
    rating: z.number()
        .int("Rating must be an integer")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating must be at most 5"),
    reviewText: z.string().min(1, "Review text cannot be empty"),
    category: z.string().optional() // Allow optional initially, AI will override
});

const updateCategorySchema = z.object({
    category: z.enum(['Food', 'Service', 'Ambiance', 'Cleanliness', 'Price'], {
        errorMap: () => ({ message: "Category must be one of: Food, Service, Ambiance, Cleanliness, Price" })
    })
});

module.exports = {
    createReviewSchema,
    updateCategorySchema
};
