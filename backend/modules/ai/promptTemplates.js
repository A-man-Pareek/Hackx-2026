const getReviewAnalysisPrompt = (reviewText) => {
    return {
        prompt: `You are a review analysis engine. Respond ONLY in valid JSON.\n\nAnalyze the following customer review text.\n\nReturn:\n{\n"sentiment": "positive | neutral | negative",\n"sentimentConfidence": number,\n"category": "food | service | staff | cleanliness | ambience | other",\n"categoryConfidence": number\n}\n\nReview Text:\n"${reviewText}"`,
        temperature: 0.2, // Low temp for more deterministic parsing
    };
};

module.exports = {
    getReviewAnalysisPrompt
};
