import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Create a reusable model instance
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export async function generateResponse(prompt) {
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating response:', error);
        throw error;
    }
}

export default genAI;