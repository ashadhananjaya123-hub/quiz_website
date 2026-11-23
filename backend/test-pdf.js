
import "dotenv/config";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function testPDF() {
  try {
    console.log("Uploading PDF...");

    const pdf = await ai.files.upload({
      file: "./sample.pdf",
      config: {
        mimeType: "application/pdf",
      },
    });

    console.log("PDF uploaded successfully!");

    console.log("PDF URI:", pdf.uri);
    console.log("PDF MIME type:", pdf.mimeType);

    console.log("Asking Gemini to read the PDF...");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL,
      contents: createUserContent([
        createPartFromUri(pdf.uri, pdf.mimeType),
        "Read this PDF and explain its main topic in 5 simple points.",
      ]),
    });

    console.log("\nGemini PDF Analysis:");
    console.log(response.text);

  } catch (error) {
    console.error("\nPDF Error:", error.message);
  }
}

testPDF();
