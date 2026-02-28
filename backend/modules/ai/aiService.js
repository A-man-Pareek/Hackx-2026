const OpenAI = require('openai');
const { getReviewAnalysisPrompt } = require('./promptTemplates');

// Lazy initialize OpenAI client to ensure safety around missing env vars if not used directly
let openaiClient = null;

const getOpenAIClient = () => {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
};

/**
 * Analyzes a review text for structured sentiment and category data.
 * Times out gracefully after 5000ms.
 * Returns the parsed JSON metadata or null if analysis failed securely.
 */
const analyzeReview = async (reviewText) => {
    // 1. Validate environment
    if (!process.env.OPENAI_API_KEY) {
        console.warn('AI Service Warning: OPENAI_API_KEY is not defined. Falling back.');
        return null;
    }

    try {
        const openai = getOpenAIClient();
        const prompt = getReviewAnalysisPrompt(reviewText);

        // 2. Wrap openAI request in a 5 second Promise raced against a rejection timer
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OpenAI Timeout Exceeded 5000ms')), 5000)
        );

        const aiPromise = openai.chat.completions.create({
            model: 'gpt-4o-mini', // Performant text parsing, use GPT-3.5 or GPT-4o-mini as fit
            messages: prompt.messages,
            temperature: prompt.temperature,
            response_format: { type: 'json_object' } // Enforce valid JSON structure
        });

        // Race to enforce stringent timing (e.g Webhooks processing)
        const response = await Promise.race([aiPromise, timeoutPromise]);

        // 3. Extract and safely parse
        const content = response.choices[0].message.content;
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

module.exports = {
    analyzeReview
};
