const getReviewAnalysisPrompt = (reviewText) => {
    return {
        prompt: `You are a review analysis engine. Respond ONLY in valid JSON.\n\nAnalyze the following customer review text.\n\nReturn:\n{\n"sentiment": "positive | neutral | negative",\n"sentimentConfidence": number,\n"category": "food | service | staff | cleanliness | ambience | other",\n"categoryConfidence": number\n}\n\nReview Text:\n"${reviewText}"`,
        temperature: 0.2, // Low temp for more deterministic parsing
    };
};

const getSuggestReplyPrompt = (reviewText, rating) => {
    return {
        prompt: `Act as a professional restaurant manager. Write a brief, empathetic response to the following customer review. Do not offer discounts unless explicitly instructed. Keep it under 3 sentences.\n\nRating: ${rating} Stars\nReview Text: "${reviewText}"`,
        temperature: 0.7, // Higher temp for more natural text
    };
};

const getDeepInsightsPrompt = (reviewsTextArray) => {
    return {
        prompt: `Analyze these recent complaints and summarize the 2 biggest recurring problems in exactly two sentences.\n\nReviews:\n${reviewsTextArray.join('\n')}`,
        temperature: 0.3,
    };
};

module.exports = {
    getReviewAnalysisPrompt,
    getSuggestReplyPrompt,
    getDeepInsightsPrompt
};
