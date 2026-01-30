
import { GoogleGenAI, Type } from "@google/genai";
import { Message, Role, EvaluationResult } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `You are LinguaBot, a friendly English speaking coach. 
Reply conversationally in spoken English, not formal writing.
Keep responses under 3 short sentences.
Ask simple follow-up questions to continue the conversation.
Gently correct major grammar mistakes by naturally restating the correct sentence in your reply.`;

export const getGeminiChatResponse = async (history: Message[]): Promise<string> => {
  try {
    const contents = history.map(msg => ({
      role: msg.role === Role.USER ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents as any,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
      }
    });

    return response.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw new Error("Failed to get response from LinguaBot.");
  }
};

export const evaluateSpeaking = async (text: string): Promise<EvaluationResult> => {
  try {
    const prompt = `You are an IELTS speaking examiner.
Evaluate the following spoken answer and return ONLY valid JSON:

{
  "band_score": number,
  "feedback": string,
  "grammar_corrections": [
    {"original": string, "corrected": string}
  ],
  "tips": [string, string, string]
}

Answer: ${text}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            band_score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            grammar_corrections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  corrected: { type: Type.STRING },
                },
                required: ["original", "corrected"]
              }
            },
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["band_score", "feedback", "grammar_corrections", "tips"]
        }
      }
    });

    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as EvaluationResult;
  } catch (error) {
    console.error("Gemini Evaluation Error:", error);
    throw new Error("Failed to evaluate your speaking.");
  }
};
