const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getReviewAnalysisPrompt, getSuggestReplyPrompt, getDeepInsightsPrompt } = require('./promptTemplates');

// Lazy initialize Gemini client to ensure safety around missing env vars
let genAI = null;

const getGenAIClient = () => {
    if (!genAI) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
};

/**
 * Analyzes a review text for structured sentiment and category data.
 * Times out gracefully after 5000ms.
 * Returns the parsed JSON metadata or null if analysis failed securely.
 */
const analyzeReview = async (reviewText) => {
    // 1. Validate environment
    if (!process.env.GEMINI_API_KEY) {
        console.warn('AI Service Warning: GEMINI_API_KEY is not defined. Falling back.');
        return null;
    }

    try {
        const client = getGenAIClient();
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const promptConfig = getReviewAnalysisPrompt(reviewText);

        // 2. Wrap Gemini request in a 5 second Promise raced against a rejection timer
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini Timeout Exceeded 5000ms')), 5000)
        );

        const aiPromise = model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptConfig.prompt }] }],
            generationConfig: {
                temperature: promptConfig.temperature,
                responseMimeType: 'application/json'
            }
        });

        // Race to enforce stringent timing
        const responseResult = await Promise.race([aiPromise, timeoutPromise]);

        // 3. Extract and safely parse
        const content = responseResult.response.text();
        const parsedResult = JSON.parse(content);

        // 4. Validate output schema conceptually
        if (!parsedResult.sentiment || !parsedResult.category) {
            throw new Error('Malformed AI Object structure missing sentiment/category');
        }

        return {
            sentiment: parsedResult.sentiment,
            sentimentConfidence: Number(parsedResult.sentimentConfidence) || 0,
            category: parsedResult.category,
            categoryConfidence: Number(parsedResult.categoryConfidence) || 0
        };

    } catch (error) {
        // Failing gracefully: The creation of a review MUST never be blocked.
        console.error('AI Processing Error:', error.message);
        return null; // Signals the controller to utilize Fallback strategies
    }
};

const suggestReply = async (reviewText, rating) => {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const client = getGenAIClient();
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const promptConfig = getSuggestReplyPrompt(reviewText, rating);

        const responseResult = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptConfig.prompt }] }],
            generationConfig: { temperature: promptConfig.temperature }
        });

        return responseResult.response.text();
    } catch (error) {
        console.error('AI Reply Suggestion Error:', error.message);
        return null;
    }
};

const generateInsights = async (reviewsTextArray) => {
    if (!process.env.GEMINI_API_KEY) return null;
    if (reviewsTextArray.length === 0) return "No sufficient data to generate insights.";
    try {
        const client = getGenAIClient();
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const promptConfig = getDeepInsightsPrompt(reviewsTextArray);

        const responseResult = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptConfig.prompt }] }],
            generationConfig: { temperature: promptConfig.temperature }
        });

        return responseResult.response.text();
    } catch (error) {
        console.error('AI Insights Generation Error:', error.message);
        return null;
    }
};

module.exports = {
    analyzeReview,
    suggestReply,
    generateInsights
};
