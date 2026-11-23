
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

console.log("Checking environment variables...");

console.log("API key loaded:", Boolean(process.env.GEMINI_API_KEY));
console.log("Model loaded:", process.env.GEMINI_MODEL || "MISSING");

if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
  console.error("Missing API key or model in .env file.");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function testGemini() {
  try {
    console.log("Connecting to Gemini...");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL,
      contents: "Say hello!",
    });

    console.log("Gemini Response:", response.text);
  }   catch (error) {
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Full error stack:");
    console.error(error.stack);
  }
}

testGemini();
