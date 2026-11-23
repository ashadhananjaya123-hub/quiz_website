import "dotenv/config";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
  Type,
} from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
export const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!apiKey) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is missing from environment variables.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export { createPartFromUri, createUserContent, Type };
