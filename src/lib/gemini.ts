import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generateSolution(apiKey: string, language: string, problemDescription: string, codeSnippet: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = "gemini-3-flash-preview"; // Standard model name

    const prompt = `
You are an expert competitive programmer.
Write a complete, optimized solution for the following LeetCode problem in ${language}.
The solution typically involves completing a class method.
Output ONLY the code that should go inside the solution editor. Do not include markdown formatting or explanations unless they are comments within the code.

Problem:
${problemDescription}

Code Snippet:
${codeSnippet}

Your Solution:
`;

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks if present
        if (text.startsWith("```")) {
            text = text.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
        }

        return text.trim();
    } catch (error: any) {
        console.error("Gemini SDK Error:", error);
        throw error;
    }
}
